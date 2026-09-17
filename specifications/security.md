# Security Requirements

The project-wide default posture (validate input, no secrets in code, default-deny authz) is in
[../CLAUDE.md](../CLAUDE.md) and applies regardless of what's filled in below. This file is for
requirements specific to *this app* — its data sensitivity, its auth model, its compliance scope.

## Data Sensitivity

- Most sensitive data this app stores: PII (name, email, phone, shipping addresses) and
  payment-adjacent data. Raw card numbers are never handled or stored by this app — Stripe
  Elements/Checkout collects them directly, so this app only ever sees a `stripePaymentIntentId`/
  token. No health data.
- Regulatory scope: GDPR (EU/Romania — buyer and seller PII), PCI-DSS **SAQ A** scope (the
  lightest tier, since card data never touches our servers — this stays true only as long as we
  keep using Stripe-hosted Checkout/Elements and never custom card-input fields).

## Authentication

- Method: email/password via Auth.js's Credentials provider. Email verification is required
  before a buyer can complete checkout or a seller can submit an application.
- Session handling: **JWT sessions with a server-side revocation check**, not database sessions.
  **[UPDATED]** This was originally spec'd as database-backed sessions; building the
  scaffolding+auth foundation established that Auth.js's Credentials provider never creates a
  database session regardless of the `session.strategy` config (confirmed against `@auth/core`'s
  actual callback code — the credentials sign-in path unconditionally issues a JWT cookie). The
  actual mechanism: a `User.sessionVersion` counter is embedded in the JWT at login and checked
  against the DB on every request (`src/lib/auth.ts`'s `jwt` callback); a mismatch or
  `status = "suspended"` returns `null`, which Auth.js treats as an invalid session and clears
  the cookie. This satisfies the underlying requirement (logout-everywhere, suspension, and
  privilege changes can force an immediate re-login) without literal DB session rows — any future
  code that changes a user's role/status must bump `sessionVersion` as part of that same
  operation for revocation to actually take effect. Session expiry: 30 days sliding for buyers,
  12 hours for seller/admin accounts, enforced via a `loginAt` timestamp in the token (Auth.js's
  own `maxAge`/`updateAge` only support one global value, not a per-role one).
- MFA required: not required in v1 for buyers; **recommended but not yet enforced** for Seller and
  Admin accounts given they control payout details and platform-wide data respectively — flagged
  as a near-term follow-up, not a launch blocker.
- External identity provider: not applicable — this app owns authentication end-to-end (see
  functional.md > Authentication & Identity Source).

## Authorization

- Model: role-based (buyer / seller / admin, from functional.md > User Roles) combined with
  ownership-based scoping for sellers (a seller may only act on `Product`/`SellerOrder` rows
  where `sellerId` matches their own `SellerProfile.id`).
- Where enforcement happens: server-side only, at the data-access layer (per CLAUDE.md's
  "Enforce ownership/tenant scoping at the data-access layer" requirement) — every seller-scoped
  Prisma query goes through a data-access function that takes `sellerId` as a required parameter
  and applies the `WHERE sellerId = ?` clause itself, so no call site can accidentally omit it.
  Route handlers/Server Actions additionally check the session's role before calling into any
  role-gated service function; the UI hiding a button is never treated as an authorization
  control.

## Data Protection

- Encryption at rest: provided by the managed Postgres host (Neon encrypts data at rest by
  default).
- Encryption in transit: HTTPS everywhere, enforced via HSTS; the database connection uses TLS.
- Fields requiring extra protection: `User.passwordHash` (bcrypt, never logged); Stripe
  identifiers (`stripePaymentIntentId`, `stripeConnectAccountId`, `stripeTransferId` — not
  secrets themselves, but never logged alongside PII); `Address` phone/recipient fields (masked
  in any log output); `SellerProfile.businessRegistrationNumber` (treated as sensitive KYC data,
  visible only to its owning seller and Admin).
- Query safety: all database access goes through Prisma's parameterized query builder; raw SQL
  is avoided, and if ever unavoidable must use Prisma's tagged-template `$queryRaw` (which
  parameterizes automatically) — never manual string concatenation.
- Passwords: hashed with bcrypt (cost factor 12), never stored or logged in plaintext.
- Error responses: client-facing errors are generic, category-level messages (see
  ui-guidelines.md > Feedback & Error States); stack traces, raw DB error messages, and query
  text are logged server-side only, never returned in an API response.
- Output safety: React/Next.js escape rendered output by default; the one place raw HTML is
  plausible is seller-authored product descriptions, so any rich-text product description must
  be sanitized server-side (e.g. via DOMPurify or an allowlist-based sanitizer) before storage or
  render — never inject seller/buyer-supplied content via `dangerouslySetInnerHTML` unsanitized.

## File Upload Handling

Relevant here: product images, seller store logos, (optionally) user avatars.

- Allowed file types and max size: JPEG, PNG, WebP only; 5MB max per file; up to 8 images per
  product, 1 logo per seller.
- Filename sanitization: the original filename is never used for the storage path. On upload, the
  server generates a new random filename (UUID + validated extension) and discards the original
  name (kept only as display metadata if needed, never interpreted as a path).
- Storage location/naming: Vercel Blob object storage; the database stores the full URL/key
  returned by the storage provider, not a local filesystem path (no local disk storage — see
  operations.md > Scalability Constraints > Statelessness).
- Authorization check timing: confirmed — the server verifies the requesting user owns (or is
  creating) the target `Product`/`SellerProfile` *before* accepting the upload into storage, not
  after; an unauthorized upload attempt never reaches the storage provider.

## Threat Model (lightweight)

- Biggest realistic threat: marketplace-specific fraud — a bad-faith seller listing products,
  collecting buyer payments, and never shipping (or a compromised seller account used the same
  way). Mitigated by: seller approval/KYC before listing (business registration number required),
  delaying payout until the return window closes rather than paying out on order placement, and
  Stripe's built-in card-fraud tooling (Radar) covering the buyer-payment side.
- Explicitly out of scope for launch (accepted risk, revisit later): custom ML-based fraud
  detection beyond what Stripe Radar provides; mandatory MFA for all account types (recommended
  only, per Authentication above); fine-grained rate-limit tuning beyond the baseline rate limits
  required by CLAUDE.md (basic login/checkout throttling ships at launch, adaptive/behavioral
  rate limiting does not).

## Audit / Logging

- Actions that must be logged for audit purposes (cross-ref `AuditLog` in data-model.md): seller
  approval/rejection/suspension, commission-rate changes, product status changes made by Admin
  (especially rejection/removal), `SellerOrder` status transitions, `Payment` status transitions,
  refunds, and any Admin action performed on another user's data. Buyer/seller self-service edits
  to their own non-sensitive data (e.g. editing an address) are not audit-logged, just normal
  `updatedAt`-tracked rows.
- Log retention: `AuditLog` entries are retained at minimum as long as the financial records they
  may relate to (see data-model.md > Data Retention — placeholder ~10 years pending confirmation
  with a legal/accounting advisor); non-financial admin actions (e.g. review moderation) are
  retained a minimum of 2 years.
- Bulk operations: per-record before/after values are logged via `ImportBatchRecord` (one entry
  per SKU processed), not just an `ImportBatch` summary count — see data-model.md > Change
  Auditing for the exact mechanism.
