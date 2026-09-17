# Operations & Runtime Requirements

The other spec files describe what the app *does*. This one describes how it behaves as a
*running system* — which is where most of "high-performance and scalable" actually lives.

## Availability & Recovery

- Uptime/availability target: 99.5%, evaluated 24/7 — ecommerce checkout has no "off hours,"
  unlike an internal business tool.
- Planned-maintenance downtime: brief windows only (minutes, not hours), scheduled during the
  lowest-traffic window (approx. 3–5am Europe/Bucharest), with an advance in-app notice banner;
  Vercel's deployment model means most releases require no downtime at all.
- Backup frequency / RPO: continuous point-in-time recovery via the managed Postgres provider
  (Neon supports PITR) rather than relying on discrete daily snapshots alone — target RPO of
  minutes, not a full day.
- RTO / restore testing: target RTO of a few hours for a full restore. *Not yet tested* — an
  untested backup isn't a backup; a restore drill must happen before launch, not just be assumed
  to work.

## Observability

- Structured application logging: JSON logs (e.g. via `pino`), including request ID, user ID
  (not PII), route, status code, and latency; shipped to Vercel's built-in log stream, forwarded
  to a log aggregator for retention/search beyond Vercel's default window — provider not yet
  chosen (e.g. Axiom or Better Stack), flagged as an open decision before launch.
- Metrics worth tracking: request rate, error rate (4xx/5xx split), latency percentiles (p50/p95)
  per route class, background job queue depth, payment failure rate, checkout funnel drop-off.
- Alerting: actively notify someone on — payment webhook failures, 5xx error rate spike above
  baseline, background job queue backing up beyond a threshold, a stuck job (see Background Jobs
  below). Alert destination (Slack/email/PagerDuty) not yet chosen — flagged as an open decision.
  Everything else recorded for dashboards/debugging but doesn't page anyone.
- Health check endpoint: `/api/health`, verifying the app process is up *and* the database is
  reachable (a simple `SELECT 1`) — not just "process alive," since a DB outage is the most
  likely real failure mode.
- PII in logs: confirmed never logged — logs reference users by ID, never by name/email/address/
  phone; full request bodies for endpoints touching `Address` or payment data are never logged
  wholesale (see security.md > Data Protection).

## Environments & Configuration

- Environments: local (developer machine, either a local Postgres instance or a personal Neon
  branch), staging (mirrors production configuration and a separate database, used for QA before
  release), production.
- Config/secrets per environment: environment variables scoped per Vercel environment
  (development / preview / production); secrets never committed, `.env.local` gitignored locally
  — per CLAUDE.md > Security Baseline.
- Release/rollback: Vercel deploys automatically on merge to `main` (or a designated release
  branch); rollback is redeploying the immediately prior Vercel deployment, which is
  near-instant since Vercel retains prior deployments as immutable artifacts.

## Database Migrations

- Schema changes ship zero-downtime using an expand/contract pattern via Prisma Migrate: add a
  new nullable column → backfill → make it required/drop the old column in a later migration —
  never a single migration that both adds a required column and expects existing rows to already
  satisfy it.
- Reversibility: every migration should have a documented rollback path in its PR description;
  destructive migrations (drops, irreversible data transforms) require a pre-migration backup
  checkpoint noted explicitly, since not every change can be cleanly reversed.
- Large-table backfills: run in batches from a background script (not inline inside the migration
  transaction) so they don't hold a long lock or risk a migration timeout as tables like `Product`
  or `Order` grow.

## Background Jobs & Queues

`performance.md` decides *what* runs async (bulk import, email, payout calculation, sales
rollups). This decides how it behaves when it fails.

- Job runner: Inngest (Next.js-native background jobs/queues, avoids standing up a separate
  worker infrastructure) — see CLAUDE.md > Tech Stack.
- Retry policy: 3 attempts per job, exponential backoff between attempts.
- Dead-letter handling: a job that exhausts its retries is recorded with `status = failed` in its
  own tracking row (e.g. `ImportBatch.status = failed`, or a general `failed_jobs` record for
  non-import jobs) and surfaced on an admin-visible dashboard; nothing fails silently into the
  void.
- Delivery guarantee: at-least-once. Every job handler must therefore be idempotent — e.g. the
  order-confirmation email job keys off `orderId` and checks whether it already sent before
  re-sending; the Stripe webhook handler keys off `stripePaymentIntentId`/Stripe's event ID before
  applying a payment status change twice.
- Stuck-job detection: a job still in `processing` past an expected threshold (e.g. 10 minutes
  for an import, 2 minutes for an email send) triggers an alert rather than sitting silently
  incomplete.

## External Integrations

- **Stripe** (payments + Stripe Connect payouts): if Stripe is unreachable, checkout is blocked
  outright with a clear "payments are temporarily unavailable, please try again shortly" message
  — this is not queued/retried silently, since a buyer needs to know their payment didn't go
  through.
- **Resend** (transactional email): if the email provider is down, the underlying action (order
  placed, product approved, etc.) still completes — the email send is queued and retried via the
  background job system rather than blocking or failing the action it's attached to.
- **Object storage / Vercel Blob** (image uploads): if unreachable, only the specific upload
  action fails with a clear error; the rest of the app is unaffected.
- Timeout/retry policy: every external call has an explicit timeout (target: 10s) and a bounded
  retry count (2–3 attempts with backoff) — never an unbounded wait.
- Circuit breaker / degradation: non-critical integrations (email) degrade gracefully — queue and
  retry later rather than blocking. Critical, payment-path integrations (Stripe) fail fast and
  surface the failure to the user immediately rather than silently retrying in the background,
  since a buyer needs to know now whether their order went through.

## Concurrency & Write Correctness

The bug class that only appears under real load, and the hardest to retrofit.

- Two users editing the same record at once: for `ProductVariant.stockQty`, use an atomic
  conditional update (`UPDATE ... SET stockQty = stockQty - ? WHERE stockQty >= ?`) rather than
  read-then-write, to prevent overselling the last units of a low-stock item under concurrent
  checkouts. For seller edits to their own `Product` (e.g. two browser tabs), accept last-write-
  wins — the ownership model already means only one seller can touch a given product, so
  cross-user conflict isn't the risk there, self-conflict is low-stakes.
- Idempotency: checkout/order creation is idempotent on a client-generated idempotency key (so a
  double-submitted checkout form or a retried request doesn't create two orders); the Stripe
  webhook handler is idempotent on Stripe's event ID / `stripePaymentIntentId` (Stripe may
  redeliver the same webhook event more than once).
- Transaction boundaries: order creation, stock reservation, and Payment Intent creation must be
  effectively all-or-nothing. Recommended flow: reserve stock with a short TTL at checkout start
  → create the Stripe Payment Intent → on webhook-confirmed payment success, permanently decrement
  stock and finalize the `Order`/`SellerOrder` rows → on payment failure or reservation timeout,
  release the reserved stock automatically. This avoids permanently decrementing stock for a
  payment that never completes.
- Known race conditions in the domain: (1) two buyers checking out the last unit(s) of the same
  low-stock `ProductVariant` simultaneously — handled by the atomic stock update above; (2) two
  overlapping bulk imports for the same seller — prevented outright by the data-model constraint
  that only one `ImportBatch` may be `pending`/`processing` per seller at a time.

## Scalability Constraints

- **Statelessness**: confirmed — Next.js on Vercel runs as stateless serverless functions by
  construction. Session state lives in the database (Auth.js DB sessions, not JWT held only
  client-side plus server memory), cart state lives in the database, and uploaded files go
  directly to Vercel Blob rather than local disk. No app instance holds state that another
  instance would need to know about.
- What breaks first as load grows: database connection count. Serverless functions can each open
  their own DB connection, and under load that can exhaust Postgres's connection limit long
  before CPU or app logic becomes the bottleneck. Mitigated from day one (not retrofitted later)
  by using Neon's built-in connection pooler (or Prisma Accelerate) for all serverless database
  access.
- Database connection pool sizing: use the pooled connection string for all serverless/edge
  access; keep each function's own Prisma client pool small (the pooler absorbs the fan-out from
  many concurrent function invocations, not a large per-instance pool).

## Query Efficiency

- N+1 prevention: enforced via Prisma's `include`/`select` reviewed explicitly on any new list
  endpoint before merge — no endpoint should issue a query per row of its own result set.
- Query budget: a typical page/endpoint should issue no more than ~5 database queries; anything
  beyond that on a list/dashboard endpoint is a flag for review (usually an N+1 or a missing
  join).
- No unbounded queries: every list query — including internal admin-only ones — has an explicit
  `take` limit and cursor/offset-based pagination; there is no "just fetch everything" query path
  anywhere in the app, per performance.md > Constraints.
- Cache invalidation: product listing/detail caches are busted on-demand (by path/tag) the moment
  a `Product` is created, updated, or deactivated — not left to expire on TTL alone, since a
  seller changing a price or going out of stock needs to reflect immediately, not after up to 5
  minutes. Category caches bust the same way on any category CRUD by Admin.
