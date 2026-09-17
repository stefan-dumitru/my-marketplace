# Project Conventions

This file is auto-loaded by Claude Code on every session in this project. Put here only what
should apply to *every* prompt and *every* feature — durable conventions, not what you're
building. What you're building lives in [specifications/](specifications/SPECS.md).

## Tech Stack

- Language / runtime: TypeScript, Node.js (via Next.js's server runtime)
- Framework(s): Next.js (App Router), React. API routes / Server Actions for the backend — no
  separate backend service.
- Database: PostgreSQL, accessed exclusively through Prisma ORM (no raw SQL string concatenation)
- Hosting / deployment target: Vercel for the app; managed PostgreSQL on Neon (built-in connection
  pooling + point-in-time recovery — see [operations.md](specifications/operations.md)). Object
  storage (product images, seller logos) on Vercel Blob.
- Key libraries you want defaulted to (avoid AI picking a random alternative):
  - Auth.js (NextAuth) with the Credentials provider + JWT sessions with a `sessionVersion`
    revocation check (see Security Baseline below)
  - Prisma (ORM + migrations)
  - Stripe SDK + Stripe Connect (for seller payouts — see functional.md > Use Cases)
  - Zod for validation (shared schema between client form + server action/route)
  - Tailwind CSS + shadcn/ui for components
  - React Hook Form for forms
  - Resend for transactional email
  - Inngest for background jobs / queues

## Architecture Principles

- Single Next.js app (monorepo of one) — no separate frontend/backend repos.
- Layering: Route handler / Server Action → service function (business logic, authorization
  checks) → data-access layer (Prisma, with ownership/tenant scoping baked in — see Security
  Baseline below). Server Actions and route handlers must not call Prisma directly for anything
  seller- or buyer-scoped.
- Route groups by audience: `(storefront)` for buyer-facing pages, `(seller)` for the seller
  dashboard, `(admin)` for the admin console. Shared UI lives in `/components`, shared logic in
  `/lib`, data-access in `/server/data`.
- Feature-based component folders: each component gets its own folder under `/components/<area>/`
  (e.g. `/components/product/ProductCard/`).

## Security Baseline   -   No need to change it between projects

Applies to every feature by default, not just ones flagged "security-sensitive". Full,
app-specific requirements live in [specifications/security.md](specifications/security.md).

- No secrets in code or commit history; use `.env.local` locally (gitignored) and Vercel
  environment variables per environment (development / preview / production) in deployment
- Validate and sanitize all input at trust boundaries (API edges, form submissions) using a single
  Zod schema shared by client and server to prevent client/server rule drift
- Default-deny authorization; check access on every request, not just at the UI layer
- Enforce ownership/tenant scoping at the data-access layer, not in each handler — every
  seller-scoped Prisma query goes through a data-access function that requires a `sellerId` and
  injects the `WHERE` clause itself; there is no code path that queries seller data without it
- Rate-limit authentication and expensive endpoints (login, checkout, search); lock out or back
  off on repeated failed logins
- CSRF protection on any state-changing request authenticated by a cookie (Auth.js provides this
  by default for its own routes — extend the same protection to custom mutating routes)
- Session cookies set httpOnly + secure + sameSite; sessions must be revocable server-side on
  logout and privilege change (e.g. seller approval, role change, suspension) — not just left to
  expire naturally. Auth.js's Credentials provider only supports JWT sessions (confirmed while
  building the auth foundation, not a preference — see security.md > Authentication), so this
  project achieves revocability via a `sessionVersion` counter checked against the DB on every
  request rather than literal database session rows; any code that changes a user's role/status
  must bump that counter as part of the same operation
- Security headers enabled: CSP, HSTS, X-Frame-Options (or `frame-ancestors`)
- CORS defaults to deny; allowed origins are an explicit allowlist (this app has no public API for
  third parties in v1, so effectively only the app's own origin)
- Lockfile committed; dependencies scanned for known vulnerabilities on a regular cadence (e.g.
  `npm audit` / Dependabot alerts in CI), not just at project start
- No org-specific baseline beyond the above — this is a greenfield solo/AI-assisted project, not
  operating under an existing company's security policy
