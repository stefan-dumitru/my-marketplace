# Release 2 Specification: Trust & Conversion

Detailed specs for the 7 items in [roadmap.md](roadmap.md)'s Release 2 table, in build order
(quick wins first). Each section has: scope, acceptance criteria, and edge cases — same intent
as [functional.md](functional.md)'s use cases, scoped to one feature at a time instead of the
whole app.

Build order: **Product gallery fix → Legal pages → Wishlist → CAPTCHA → Google OAuth →
CI/CD + staging → Mobile-first pass.**

---

## 1. Product gallery fix

**Problem:** `src/app/(storefront)/products/[slug]/page.tsx` only ever renders
`product.images[0]`. Sellers can upload up to `MAX_PRODUCT_IMAGES` (8) via `ProductForm`, but
buyers never see anything past the first one. This is a bug fix, not new functionality — no
schema change (`Product.images` is already `String[]`).

**Scope:**
- Product detail page renders a gallery: a large primary image + a thumbnail strip/row of the
  remaining images (if more than one exists).
- Clicking/tapping a thumbnail swaps the primary image.
- Gallery is per-product, not per-variant — no per-variant image swapping (that stays out of
  scope; flagged in `user-workflows.md` as a deliberate absence, and nothing about this fix
  changes that).

**Acceptance criteria:**
- [ ] A product with 1 image: renders exactly as it does today (no empty thumbnail row).
- [ ] A product with 2–8 images: primary image + clickable thumbnails for the rest.
- [ ] A product with 0 images: unchanged placeholder behavior (currently a blank `bg-muted` box).
- [ ] Keyboard-navigable (thumbnails are real buttons/links, not divs with only a click handler).
- [ ] No layout shift when swapping images (reserve aspect-ratio space).

**Edge cases:**
- Seller removes images after buyers have the page cached/open — page is `force-dynamic`
  already (see the file's own comment on why), so a refresh always reflects current images; no
  extra handling needed.
- Very tall/wide source images — same object-cover behavior as today, just applied per-thumbnail
  too.

---

## 2. Legal pages (Terms of Service, Privacy Policy, Returns Policy)

**Problem:** No `/terms`, `/privacy`, or `/returns` routes exist. Real payments and real PII are
being processed with no disclosed policy — a legal minimum before onboarding real users, per
CLAUDE.md's Security Baseline (PII handling, GDPR-adjacent deletion already exists in code but
isn't documented for users anywhere).

**Scope:**
- Three new static routes: `/terms`, `/privacy`, `/returns`, under `(storefront)`.
- Footer (new, if one doesn't exist yet — check `Header`/layout for whether a footer exists at
  all) links to all three from every page.
- Content is static Markdown-like content rendered server-side — no CMS, no admin-editable
  content in this release (that's a v-next concern if legal text needs to change often).
- Privacy Policy must accurately describe what's actually collected/retained today: account PII,
  addresses, order history retained post-deletion per the GDPR-anonymization flow already
  implemented (`anonymizeUserById` in `src/server/data/users.ts`), Stripe as a payment processor,
  Resend as an email processor, Vercel Blob for image storage.
- Returns Policy must match the actual implemented behavior: return requests only after
  `delivered`, one per sub-order, seller approves/rejects (see `user-workflows.md` § 1.3) — the
  policy text should not promise anything the app doesn't do (e.g. don't write "30-day returns"
  if the app has no enforced return window today).

**Acceptance criteria:**
- [ ] All three pages reachable from a footer link on every `(storefront)` page.
- [ ] Content accurately reflects actual data retention / actual return process (no aspirational
      claims not backed by code).
- [ ] Pages are indexable (no `noindex`) — they help SEO too (see roadmap's later SEO items).
- [ ] Cookie/consent banner is explicitly **out of scope for this item** — tracked separately if
      re-added to the roadmap (it was cut in a prior edit; flagged, not assumed).

**Edge cases:**
- None functionally — this is static content. The main risk is content accuracy, not code.

---

## 3. Wishlist / "customers also bought"

**Problem:** No saved-for-later mechanism exists. Buyers can only act on a product immediately
(add to cart) or lose it.

**Scope — Wishlist (primary):**
- New `Wishlist`/`WishlistItem` models, mirroring the existing `Cart`/`CartItem` shape
  (`prisma/schema.prisma` lines ~388–414) but simpler: no `quantity` — a wishlist item is just
  "this buyer wants this product," not a specific variant/quantity intent.
  ```prisma
  model Wishlist {
    id        String         @id @default(cuid())
    userId    String         @unique
    updatedAt DateTime       @updatedAt
    user      User           @relation(fields: [userId], references: [id])
    items     WishlistItem[]
    @@map("wishlists")
  }
  model WishlistItem {
    id        String   @id @default(cuid())
    wishlistId String
    productId String
    createdAt DateTime @default(now())
    wishlist  Wishlist @relation(fields: [wishlistId], references: [id])
    product   Product  @relation(fields: [productId], references: [id])
    @@unique([wishlistId, productId])
  }
  ```
- Product detail page: a "Save for later" / heart-icon toggle button next to Add to Cart —
  requires login (same "Log in to buy"-style gate pattern as the buy control).
- New `/account/wishlist` page listing saved products (image, name, price, "Move to cart",
  "Remove"), same pagination pattern as `/orders`.
- Header nav gets a wishlist icon/count, same treatment as the existing cart icon.

**Scope — "customers also bought" (secondary, smaller effort):**
- On the product detail page, a row of up to N other products bought by buyers who also bought
  this one — derived from a simple co-occurrence query over `OrderItem` (same
  `productVariant.productId` grouped by `sellerOrder.order.buyer`), not a recommendation engine.
- If no co-purchase data exists yet (cold start, low order volume) — section is hidden
  entirely, not shown empty.

**Acceptance criteria:**
- [ ] Anonymous visitor sees no wishlist button (or a login-gated one, consistent with the buy
      control's own anonymous treatment).
- [ ] Saving/removing is idempotent (`@@unique([wishlistId, productId])` backs this at the DB
      layer, same pattern as `CartItem`'s own unique constraint).
- [ ] A wishlisted product that later goes inactive/deleted still shows in the list but is
      clearly marked unavailable (no "move to cart" for it) — do not silently drop it.
- [ ] "Customers also bought" never leaks another buyer's identity — aggregate counts only.

**Edge cases:**
- Product deactivated by seller while still wishlisted by buyers — list must not 500, must
  degrade gracefully (see acceptance criteria above).
- A seller's own products in their own "customers also bought" — no special-casing needed, this
  is buyer-facing only, sellers don't see this on their own dashboard.

---

## 4. CAPTCHA (Cloudflare Turnstile)

**Problem:** Rate limiting (`checkRateLimit`, already used on login/register/forgot-password/
checkout) throttles *volume* but doesn't distinguish a human from a script spread across many
IPs/accounts. No bot-detection layer exists today.

**Scope:**
- Cloudflare Turnstile widget (invisible/managed mode, not the interactive puzzle) added to:
  - `/auth/register`
  - `/auth/login` (only after N failed attempts for that email — avoid friction on every normal
    login; reuse the existing `checkRateLimit` counter to decide when to render the widget)
  - `/auth/forgot-password`
  - `/sell` (seller application form)
- New env vars: `TURNSTILE_SITE_KEY` (public, client-side), `TURNSTILE_SECRET_KEY` (server-side
  verification only) — added to `.env.local.example` and Railway.
- Server-side verification: each protected Server Action calls Cloudflare's `siteverify` API
  with the token before proceeding: on failure, return the same generic form error already used
  for other validation failures (no new user-facing error copy needed).

**Acceptance criteria:**
- [ ] A request with a missing/invalid/expired Turnstile token is rejected server-side, not just
      hidden client-side (client-side-only checks are trivially bypassed).
- [ ] Verification failure doesn't leak *why* (matches the existing no-enumeration posture on
      login/forgot-password).
- [ ] Turnstile failing open (Cloudflare's service down) is a deliberate decision to make
      explicitly, not an accident — recommend fail *closed* (block the action) with a logged
      error, consistent with this app's default-deny security posture (CLAUDE.md).
- [ ] Widget respects the existing CSP (`src/proxy.ts`) — Turnstile's script domain needs adding
      to `script-src`/`connect-src`/`frame-src` as appropriate; this is the one place this
      feature touches security-sensitive infra outside its own new code.

**Edge cases:**
- Turnstile script blocked by an ad-blocker/privacy extension on the client — form should still
  be submittable if the widget fails to load, with server-side verification then failing
  gracefully (clear error, not a silent 500).

---

## 5. Google OAuth — ✅ built

**Problem:** `src/lib/auth.ts` only configured a `Credentials` provider. `User.passwordHash` was
a required (`String`, not `String?`) column — the schema itself assumed every user has a
password, which an OAuth-created account won't.

**Actual design (simpler than first planned below — no Account/Session adapter tables added):**
Auth.js only *needs* a database adapter if you want it to own account-linking/user-creation
itself. Since this app already fully owns its `User` model (custom services, GDPR anonymization,
`sessionVersion` revocation, admin suspension) and forces JWT sessions regardless of provider
(Credentials requires it — see the existing `session.strategy` comment), introducing
`@auth/prisma-adapter` would have meant reconciling its expected shape (`emailVerified`, `image`,
a separate `Account` table) against this app's already-bespoke shape (`emailVerifiedAt`, no
`image`, no separate table) for no real benefit.

Instead, the Google provider's own `profile()` callback (in `src/lib/auth.ts`) does the
lookup-or-create directly against the existing `users` table and returns an object already
shaped exactly like `next-auth.d.ts`'s augmented `User` type (`id`, `role`, `status`,
`emailVerifiedAt`, `sessionVersion`). Because of that, **the `jwt` callback needed zero changes**
— it already branches on "was a `user` object handed to me this call," which is true for both
providers' first mint, and the object it receives now looks identical regardless of which
provider produced it. This is what makes "same email → same account" work with no separate
linking table: the lookup *is* the linking, keyed on the same `email` unique constraint every
other part of the app already relies on.

**What was built:**
- `User.passwordHash` → nullable (migration hand-written and applied directly to the live Neon
  DB, same pattern as the wishlist migration — verified afterward that 0 of 20 existing users
  ended up with a null hash).
- `createUser()` (`server/data/users.ts`) gained optional `passwordHash`/`emailVerifiedAt` params.
- `authorize()`'s Credentials path now null-checks `user.passwordHash` before `bcrypt.compare`,
  falling through to the same dummy-hash timing-safe branch already used for "no such user" — an
  OAuth-only account hitting the password form fails exactly like a wrong password, no distinct
  error (no enumeration regression).
- Google provider registered **only when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are both set**
  (`googleOAuthEnabled`, exported from `auth.ts`) — an empty clientId/clientSecret would otherwise
  crash Auth.js at startup. The "Continue with Google" button (new `GoogleSignInButton`
  component) is gated on that same flag from the login/register Server Component pages, so it
  never renders when the provider isn't actually there to handle it. **No real Google Cloud
  credentials were available in this session** — the code path is fully built and its every
  building block verified (see below), but an actual browser OAuth round-trip needs those two env
  vars filled in with real values from Google Cloud Console.
- `profile()` throws (→ Auth.js redirects to `/auth/login?error=...`) if Google reports the email
  as unverified, or if the matched/created user's `status` is `"suspended"` — same fail-closed
  posture as the Credentials path, though less precise (a generic "Couldn't sign you in with
  Google" message on the login page, not a distinguishable reason — Auth.js's plain-`Error`
  → `AccessDenied` redirect doesn't carry a custom `code` the way `CredentialsSignin` subclasses
  do for the password flow).
- `sessionVersion` revocation is unaffected by construction — every request past the first token
  mint re-validates against the DB by `token.id` in the unchanged `jwt` callback branch,
  regardless of which provider originally created the session.

**Verified (without real Google credentials):**
- 0 of 20 existing users had their password hash nulled by the migration.
- A simulated OAuth-style user (`passwordHash: null`) round-tripped through create → re-lookup by
  email (finds the same row, confirming the linking mechanism) → the Credentials null-check
  branch (falls through cleanly, never crashes).
- Full `tsc`/`eslint` clean; Google button correctly absent from both pages with no credentials
  configured; both pages still render normally.
- **Not verified in this session:** an actual browser-driven Google consent screen round-trip —
  needs real `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` from Google Cloud Console (OAuth client type
  "Web application," Authorized redirect URI `{origin}/api/auth/callback/google`), which only the
  project owner can create.

---

## 6. CI/CD with test gates + staging environment

**Problem:** No `.github/` directory exists — zero automated checks run before a deploy.
Railway currently builds and deploys straight from a push to `master` (per the
`Deploy to Railway` work from this project's history).

**Scope:**
- New GitHub Actions workflow (`.github/workflows/ci.yml`): on every push and PR — install deps,
  `npm run lint`, `npm test` (the existing 94-test Vitest suite + its `TEST_DATABASE_URL`
  fixture, already wired for exactly this), `npm run build`. Any failure blocks merge (branch
  protection rule on `master` requiring the check to pass — a GitHub repo setting, not code).
- **Staging environment on Railway:** a second Railway service, same repo, deploying from a
  `staging` branch (not `master`) — its own `DATABASE_URL` pointing at a second Neon database
  (`my_marketplace_staging`, same pattern as the existing `my_marketplace`/
  `my_marketplace_test` split), its own Stripe **test-mode** keys (already the case — the app
  has never used live Stripe keys), its own `NEXTAUTH_URL`.
- Workflow: feature branches → PR into `staging` → auto-deploys to the staging Railway service →
  manual verification → PR from `staging` into `master` → auto-deploys to production.

**Acceptance criteria:**
- [ ] A PR with a failing test or lint error cannot be merged (GitHub branch protection blocks
      it, not just a red X someone can ignore).
- [ ] `staging` and `master` deploy to two distinct Railway URLs with two distinct databases —
      verified by placing a test order on staging and confirming it never appears in production
      data (mirrors the exact verification approach already used for the Neon migration).
- [ ] Documented in `operations.md` (existing file) as the new deploy process, since this
      changes what "deploying to Railway" means going forward.

**Edge cases:**
- Prisma migrations: staging needs its own migration history applied before first use (same
  `prisma migrate deploy` step already in `package.json`'s `start:prod` script handles this
  automatically — no new migration tooling needed, just a second database to run it against).
- Stripe webhook: staging needs its **own** Stripe webhook endpoint (same lesson learned setting
  up production's) pointing at the staging Railway URL, with its own signing secret — cannot
  reuse production's webhook endpoint.

---

## 7. Mobile-first pass

**Problem:** No dedicated mobile audit has been done — "responsive" exists only in the sense
that Tailwind's responsive utility classes are used ad hoc across components as they were built,
not as a deliberate mobile-first design pass.

**Scope:**
- Run Lighthouse (mobile profile) against the key pages: homepage, product list, product detail,
  cart, checkout, order detail, seller dashboard home. Record baseline scores before changing
  anything.
- Audit and fix, per page, in priority order (highest-traffic pages first): tap target sizing
  (44×44px minimum), font sizes below 16px causing iOS auto-zoom on form inputs, horizontal
  scroll/overflow, the `Header`'s mobile hamburger `Sheet` menu (already exists — verify it,
  don't rebuild it), the checkout `AddressForm` and `ProductFilterForm` (both have several
  fields — highest risk of cramped mobile layouts).
- This item benefits from running *last* in Release 2's build order specifically because the
  gallery fix, wishlist, CAPTCHA, and OAuth all touch UI that this pass would otherwise have to
  redo — auditing before those land risks auditing screens that are about to change shape again.

**Acceptance criteria:**
- [ ] Lighthouse mobile score ≥ 90 on the 7 pages listed above (baseline recorded, then compared
      post-fix).
- [ ] No horizontal scroll on any page at 375px viewport width (iPhone SE, the smallest common
      target).
- [ ] All interactive elements meet the 44×44px minimum tap target.
- [ ] Every form input is ≥16px font size (prevents iOS Safari's auto-zoom-on-focus behavior).

**Edge cases:**
- Seller/admin dashboards are lower priority than buyer-facing pages (sellers/admins are more
  likely to use desktop) but should not be actively broken on mobile — "audited last, not
  skipped."
- Tables (e.g. `/admin/audit-log`, `/seller/reports`) don't collapse well on narrow viewports by
  default — decide per-table whether to horizontal-scroll-within-a-container (simplest) or
  reflow to a card layout (more work, better UX) before implementing, rather than defaulting to
  whichever Tailwind produces first.

---

## Cross-cutting notes

- Items 4 and 5 (CAPTCHA, Google OAuth) both touch `src/lib/auth.ts` and its surrounding forms —
  worth sequencing carefully so one doesn't undo the other's in-flight changes; recommend
  finishing CAPTCHA's server-action integration before starting the OAuth provider work, even
  though both ultimately land in the same file.
- Item 6 (CI/CD) should ideally exist *before* items 4–5 merge, so those higher-risk auth changes
  get the safety net — but "quick wins first" (this doc's chosen order) intentionally defers it
  behind the smaller items. Worth revisiting if that tension becomes a real problem once building
  starts.
- None of these 7 items require changes to `security.md`'s stated baseline — they extend it
  (OAuth needs its own line in "Authentication," CAPTCHA needs a line in the security baseline
  once built) rather than contradict anything already documented.
