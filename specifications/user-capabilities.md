# User Capabilities Reference

A capability tree for every screen in the app, organized by user category (Buyer, Seller,
Admin) and then by route/page within that category's interface. Generated directly from the
current route handlers, Server Actions, and forms — not from the functional spec — so it
reflects what the code actually does, including validation rules and edge cases a user would
notice.

Three interfaces exist, gated by route group:
- `(storefront)` — buyer-facing pages, open to any logged-in user (plus some anonymous browsing)
- `(seller)` — seller dashboard, gated to users with an `approved` `SellerProfile`
- `(admin)` — admin console, gated to users with `role: "admin"`

---

## 1. Buyer — `(storefront)`

### Access & navigation

- Anonymous visitor sees: Logo, Products, theme toggle, Log in, Sign up
- Logged-in buyer additionally sees: notification bell (unread badge) → `/notifications`, cart
  icon (item-count badge) → `/cart`, "Sell on My Marketplace" → `/sell`, "Account" → `/account`
- Logged-in seller sees "Seller Dashboard" instead of the sell pitch; logged-in admin sees "Admin"
- Mobile (<1024px) collapses the same links into a hamburger menu

### `/` — Homepage

- Browse hero pitch, category chips (up to 12), featured active products (up to 8)
  - Click category chip → filtered product list
  - Click product card → product detail
  - "Sell on My Marketplace" CTA (hidden for sellers/admins, who already have a dashboard link)

### `/products` — Product list

- Free-text search (`q`)
- Filter by category, brand, minimum rating (4+/3+/2+/1+ stars), min/max price
- "Clear filters" (only shown when a filtered search returns zero results)
- Pagination
- Only `active`-status products are ever listed

### `/products/[slug]` — Product detail

- View image, category, seller, average rating + review count, brand, description
- Pick variant attributes (e.g. size/color) → price/stock update to match
  - Unmatched combination → "This combination is currently unavailable."
- Not logged in → "Log in to buy" (no add-to-cart control)
- Logged in → choose quantity (capped at current stock), "Add to cart"
  - Out of stock → "Add to cart" replaced with "Out of stock" text
  - Server re-validates product is still active and variant has stock at submit time
- Read reviews (approved-status only; pending/rejected reviews are never public)

### `/cart` — Cart

- Requires login
- Per item: change quantity (capped at stock), remove
- Grouped by seller with per-seller subtotal, grand total across all sellers
- Stock warning shown inline if a stored quantity now exceeds live stock
- "Checkout" → `/checkout`
- Arriving via `?verify=1` (bounced from checkout) → email-verification banner + resend button

### `/checkout` — Checkout

- Requires login **and verified email** — unverified buyers are redirected to `/cart?verify=1`
- Pick a saved address or enter a new one (recipient, street, apt, city, county, postal code,
  phone — country fixed to România)
- Optional: "Save this address to my account"
- "Continue to payment" → creates Stripe Checkout Session, redirects to Stripe
  - Stock/availability re-validated at this exact moment (not just at add-to-cart)
  - Empty cart / unavailable product / insufficient stock all surface a specific inline error
- Rate-limited: 10 attempts / 10 min

### `/checkout/success` — Post-payment

- Shows "confirmed" or "still confirming" depending on live order status (Stripe's redirect can
  arrive before its webhook)
- "View order" → `/orders/{id}`

### `/checkout/failed` — Payment failed

- "Retry payment" → new Stripe Checkout Session for the *same* order (never creates a duplicate)
  - Rejected if the order already succeeded elsewhere ("This order has already been paid.")
- Rate-limited: 10 retries / 10 min
- "View all orders" → `/orders`

### `/orders` — Order list

- Paginated list of the buyer's own orders (order number, date, status, total)
- Click an order → `/orders/{id}`

### `/orders/[id]` — Order detail

- View per-seller sub-orders: status, line items, subtotal; shipping address snapshot; grand total
- "Download invoice" → PDF download
- Per delivered line item with no review yet: submit a review (rating 1–5, title, body)
  - One review per order item (race-safe unique constraint)
  - Only allowed once that item's sub-order is `delivered`
  - Already-reviewed items show the buyer's own rating + moderation status instead of the form
- Per delivered sub-order with no return request yet: request a return (free-text reason)
  - Only allowed once, only when `delivered`
  - Already-requested sub-orders show status instead (pending / approved-refunded / rejected)
- **No self-service order cancellation exists anywhere** — only review and return, and only
  after delivery

### `/notifications` — Notifications

- Paginated list, unread visually highlighted
- Click a notification (if it has a link) → navigates there
- Viewing a page marks those notifications read as a side effect

### `/account` — Account dashboard

- View profile summary, stats (orders, total spent, saved addresses, unread notifications), 3
  most recent orders, account details (incl. email-verified status)
- "Manage addresses" → `/account/addresses`
- "Log out"
- "Delete account" (type-to-confirm email match)
  - GDPR-style anonymization, not a hard delete — orders/invoices retained with PII stripped
    (tax-record requirement)
  - **Sellers cannot self-delete** — must contact support
  - Rate-limited: 5 attempts / 15 min, idempotent on repeat

### `/account/addresses` — Address book

- List saved addresses, "Default" badge on one
- "Set as default" (only shown on non-default addresses)
- Edit / Delete per address

### `/account/addresses/new` and `/account/addresses/[id]/edit`

- Fill/edit label, recipient, street, apt, city, county, postal code, phone, "set as default"
- Edit is ownership-scoped — 404 for another buyer's address

### `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`,
`/auth/verify-email`

- Standard credential auth flows
- Registration password policy: 8+ chars, upper + lower + number
- Browsing is allowed pre-verification; **checkout and seller applications require a verified
  email**
- Forgot-password never reveals whether an account exists (same response either way); reset
  link expires in 1 hour and **logs the user out of every other session** on success
- All flows are rate-limited (10/hour registration, 3/15min forgot-password requests,
  10/15min reset attempts, 10/15min verification attempts)

### `/sell` — Apply to become a seller

- No profile yet → submit application (store name, business registration number, description,
  logo)
- Existing profile → status-specific message instead of the form (`pending` under review /
  `rejected` contact support / `suspended` contact support / `approved` → redirected straight
  to `/seller`)
- **One application per buyer** — no way to reapply while a profile of any status already exists

---

## 2. Seller — `(seller)`

**Gate:** requires a logged-in user with `SellerProfile.status === "approved"`; anything else
(no profile, `pending`, `rejected`, `suspended`) redirects to `/sell`. Every Server Action
re-checks this independently, not just the page layout.

### `/seller` — Dashboard home

- Stat tiles: orders this month, pending shipment count, low stock count, pending payout amount
- Paginated list of own products (name, category, SKU, status, price/range, stock)
- "Add product", "Import CSV", "Orders", "Payouts", "Sales report", "Back to marketplace"
- Per product: "Variants", "Edit", **Activate/Deactivate** toggle
  - Toggle only available once a product is already `active`/`inactive` — pending/draft/rejected
    products aren't seller-togglable (admin decides those)

### `/seller/products/new` — Add product

- Name, category, brand, description, SKU, up to 8 images (JPEG/PNG/WebP, ≤5MB each), price,
  stock quantity
- SKU must be unique **per seller** (not globally)
- **New products are not immediately live** — created as `pending_review`, triggers an admin
  notification, requires admin approval before appearing on the storefront
- Rate-limited: 30 requests / 600s

### `/seller/products/[id]/edit` — Edit product

- Same fields as create, **SKU is immutable** after creation
- Ownership-scoped — 404 for another seller's product
- Image cap enforced across existing + new combined

### `/seller/products/[id]/variants` — Variant list

- "Add variant", per variant: Edit / **Delete**
  - Cannot delete the last remaining variant of a product
  - Cannot delete a variant that has order history — must zero its stock instead

### `/seller/products/[id]/variants/new` and `.../[variantId]/edit`

- SKU (immutable on edit), dynamic attribute key/value pairs (≥1 required), price, stock
- Variant SKU must be unique per seller

### `/seller/products/import` — CSV import

- Choose mode: `add_only` (new SKUs only) / `full_replace` (creates+updates every SKU in file,
  **deactivates any active product not present in the file**) / `attribute_update`
  (price/stock only, never creates)
- File ≤2MB; ≥100 rows auto-enqueues a background job instead of processing synchronously
- Duplicate SKUs within a file: last occurrence wins
- Rate-limited: 10 requests / 600s
- "Past imports" list, click through to batch detail

### `/seller/products/import/[batchId]` — Import batch detail

- Per-row outcome: Created / Updated / Skipped / Failed / Deactivated, with error message if any
- "Refresh" while still processing

### `/seller/orders` — Order list

- Paginated list of own sub-orders (order number, date, status, subtotal, refund/return notes)

### `/seller/orders/[id]` — Order detail

- View line items, shipping address
- **Mark as shipped** (only from `confirmed`) — requires tracking number
- **Cancel order** (only from `confirmed`) — releases reserved stock, issues a real Stripe refund
  for this seller's portion; idempotent/safe to retry after a partial failure
- **Mark as delivered** (only from `shipped`)
- **Approve / Reject return** (only when sub-order is `delivered` and a return request is
  `pending`) — approve refunds via Stripe + restores stock; reject just closes the request
- Cancel and return-resolve share a rate limit: 30 requests / 600s (both call Stripe)

### `/seller/payouts` — Payouts

- Connect Stripe account / finish onboarding (status-dependent CTA), hidden once fully connected
- Paginated payout history (period, status, paid date, amount)
- "Download CSV"
- **Orders only become payout-eligible 14 days after delivery** (fraud-mitigation hold)
- Actual payout release only happens via a weekly cron or an admin-triggered batch — never
  seller-initiated

### `/seller/reports` — Sales report

- Range filter: This month / Last 30 days / All time
- Stat tiles: orders, subtotal, commission, payout
- Per-order row breakdown, "Download CSV"

---

## 3. Admin — `(admin)`

**Gate:** requires a logged-in user with `role: "admin"`; anything else redirects (no session →
login, wrong role → `/`). Every Server Action independently re-checks this.

### `/admin` — Dashboard home

- Read-only stat tiles: GMV this month, active sellers, pending seller approvals, orders today,
  reviews taken down
- "Back to marketplace"

### `/admin/sellers` — Seller management

- Three lists: pending applications, approved sellers, suspended sellers
- Per pending application: **Approve** / **Reject**
  - Approve promotes the user's role to `seller` and bumps `sessionVersion` (forces
    re-auth), sends approval email
  - Only valid while status is still `pending`
- Per approved seller: inline **commission rate override** (0–1, blank clears back to category
  default), **Suspend**
  - Suspending **deactivates all of that seller's active product listings** as a side effect
- Per suspended seller: **Reinstate**
  - Reinstating does **not** auto-reactivate previously deactivated listings — seller must
    redo that manually
- "Download seller performance CSV"
- Every action writes an audit log entry with before/after values and the acting admin

### `/admin/reviews` — Review moderation

- Reviews **auto-approve on submission** — there is no pre-publish queue
- Per review: **Take down** (live → rejected) / **Restore** (rejected → live)
  - No-op-safe: acting on a review already in that state returns an error instead of double-
    logging

### `/admin/products` — Product moderation queue

- Shows only `pending_review` products (not the full catalog)
- Per product: **Approve** (→ `active`, goes live) / **Reject** (→ `rejected`)
  - Guarded against acting twice on the same product ("no longer pending review")
- No admin edit/delete of product content here — approve/reject only

### `/admin/categories` — Category management

- List all categories (name, slug, parent, active flag, default commission rate)
- "New category" → create form; click a row → edit form
- Fields: name, parent (excludes self when editing — **a category cannot be its own parent**),
  image, default commission rate (0–1), active checkbox
- Deactivating a category removes it from the picker/storefront without deleting it
- Commission-rate changes are separately audit-logged (only when the rate actually changes)

### `/admin/payouts` — Payout oversight

- Paginated payout history (read-only rows)
- **"Run payout batch now"** — queues the same release job the weekly cron uses (Monday 06:00
  UTC); no per-row manual release exists
- One Stripe transfer per seller per run, not per order; one seller's failure doesn't block
  others — failed payouts auto-retry next run
- No connected Stripe account → immediately marked failed, no Stripe call attempted

### `/admin/reports` — Platform revenue reports

- Range filter: This month / Last 30 days / All time
- Stat tiles: orders, subtotal (GMV), commission, payout — platform-wide
- Per-seller breakdown table, "Download CSV" (unpaginated full export regardless of range)

### `/admin/audit-log` — Audit log

- Read-only, reverse-chronological list of every auditable action platform-wide (seller
  approvals/suspensions, category commission changes, product/review moderation, payouts,
  shipments/cancellations/refunds, payment events, GDPR anonymization)
- "Download CSV" (capped at 10,000 rows)
- No admin action on this page mutates anything

---

## Cross-cutting rules worth remembering

- **Ownership isolation is enforced at the data layer everywhere** — a seller can only ever
  see/act on their own products, variants, orders, payouts, and import batches; a buyer can
  only see their own orders/addresses. Anything not found or not owned renders as a plain 404.
- **Every gate is re-checked inside each Server Action**, not just the page layout — a layout
  redirect protects the page view, but the mutation itself is a separate entry point.
- **New products and new seller applications both require admin sign-off** before going live —
  neither a new product nor a new seller account is immediately active.
- **No buyer-initiated order cancellation** exists — only seller-initiated cancellation
  (pre-shipment) and buyer-initiated return requests (post-delivery).
- **Refund/payout Stripe operations are idempotent by design** (cancel, return-resolve, payout
  release all use Stripe idempotency keys) so retrying after a partial failure never double-
  refunds or double-pays.
