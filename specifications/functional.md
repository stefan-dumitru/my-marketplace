# Functional Specification

## Product Overview

- What is this app, in 2-3 sentences: A multi-vendor ecommerce marketplace modeled closely on
  emag.ro. Buyers browse and search a unified catalog contributed by many independent sellers,
  and complete a single checkout that internally splits into a sub-order per seller. Sellers get
  their own dashboard to manage products, stock, and fulfillment; the platform takes a commission
  per sale.
- Who is it for: Buyers/consumers shopping across many categories in one place; third-party
  sellers/merchants who want retail reach without building their own storefront; platform admins
  who run the marketplace.
- Core problem it solves / why it needs to exist: Gives small and medium sellers access to a large
  buyer base and shared checkout/logistics/trust infrastructure they couldn't build alone, and
  gives buyers one place to compare and buy from many sellers instead of many separate stores.
- Explicit scope boundary — deliberately excluded from v1: the platform's own last-mile delivery
  network (courier operations) — v1 integrates with third-party shipping providers for tracking
  only, it does not run logistics; B2B/wholesale bulk ordering; auctions/bidding; a loyalty
  program / subscription tier (e.g. an "emag genius"-style membership); physical retail locations;
  manufacturing or first-party-brand products.

## Authentication & Identity Source

- Does this app handle its own login, or receive an already-authenticated identity from an
  external system: This app owns authentication itself — email/password with required email
  verification before checkout (see [security.md](security.md) > Authentication). No SSO/external
  identity provider in v1.
- If external: N/A.

## User Roles

| Role | Description | Can do | Cannot do |
|---|---|---|---|
| Guest (unauthenticated) | Anonymous visitor | Browse/search categories & products, view product detail pages, add items to a session-based cart | Checkout, leave reviews, access order history — must register/log in first |
| Buyer | Registered shopper | Browse/search, checkout (single flow across multiple sellers), view own order history and track sub-orders, request returns/refunds, leave reviews on delivered purchases, manage own addresses | See other buyers' orders/data, manage any product or seller data |
| Seller | Approved third-party merchant. Data scope: sees and manages only its own products, orders (sub-orders), stock, and payouts — never another seller's data | CRUD own products/variants/stock/price, view and fulfill own sub-orders (mark shipped, add tracking), bulk import/update own products via CSV, view own sales dashboard and payout history | View or modify another seller's products/orders, manage categories, approve/reject sellers, change commission rates, moderate reviews platform-wide |
| Platform Admin | Marketplace operations staff. Data scope: full access across all sellers/buyers/orders, but every admin action is audit-logged | Approve/reject/suspend sellers, manage category tree, moderate products & reviews, view all orders and sellers, adjust commission rates, issue refunds, view platform-wide reporting | N/A — full access by design, but every action must be attributable and logged (see security.md > Audit / Logging) |

Aggregate dashboard needs:
- Seller: dashboard shows aggregate stats scoped to that seller — e.g. "42 orders this month,
  3 pending shipment, 2 low-stock alerts, €1,240 pending payout" — not just a raw order list. This
  needs a summary endpoint, not just the list endpoint.
- Admin: platform-wide aggregate dashboard — GMV this month, active sellers, pending seller
  approvals, orders today, flagged reviews awaiting moderation.
- Buyer: no aggregate dashboard needed beyond an order list; a simple "recent orders" widget is
  enough.

## Notifications

- Does this app need to notify anyone beyond its own logged-in users: No third-party
  organizations/partners are notified in v1 — all notification recipients are the app's own
  users (buyers, sellers, admins). Shipping couriers are consumed as an integration (tracking
  data in), not notified out.
- Recipient types and templates:
  - Buyer: order confirmation, payment failure, shipment dispatched, out for delivery/delivered,
    return/refund status change, review reminder (few days after delivery). Fixed templates per
    event type, not per seller.
  - Seller: new order received, buyer cancellation, low-stock alert, payout processed, seller
    application approved/rejected, bulk import completed (with success/fail counts).
  - Admin: new seller application submitted, product/review flagged for moderation, payment
    webhook failure, background job stuck (see operations.md > Background Jobs).
- Delivery channel per recipient: Email (via Resend) for all of the above, plus an in-app
  notification center (bell icon, read/unread) mirroring the same events for logged-in users.
  SMS is out of scope for v1.

## Search & Reporting

- What's searchable, on which entities, by which fields: Products — name, description, brand,
  category, SKU. Within a role's own scope: Orders — by order number, buyer name/email (seller
  sees only its own sub-orders; admin sees all).
- Match type: Product search uses PostgreSQL full-text search (`tsvector`/`tsquery`) with
  trigram fallback for typo tolerance in v1 — a plain index is not enough for free-text product
  search, but a dedicated search engine (Algolia/Meilisearch) is deferred until catalog size or
  relevance needs actually require it. Order/admin lookups are exact/prefix match on a plain
  index.
- Reports/exports per role, format:
  - Seller: sales report (on-screen dashboard + CSV export), payout history (on-screen + CSV).
  - Admin: platform revenue & commission report (on-screen + CSV), seller performance report
    (CSV), audit log export (CSV, admin-only).
  - Buyer: order history with downloadable invoice (PDF) per order.
- Aggregated/denormalized data needed: Yes — daily/monthly sales rollups (per seller and
  platform-wide) should not be computed by aggregating raw orders on every dashboard load once
  order volume grows. Plan for a denormalized summary table (e.g. `daily_seller_sales`) populated
  by a background job, per `operations.md` > Background Jobs & Queues.

## Use Cases

1. **Browse & Search** (Guest/Buyer) — browse the category tree, search products, filter by
   price/brand/rating, view a product detail page with variant selection (e.g. size/color).

2. **Cart & Checkout** (Buyer) — add/remove items (cart persists per session for guests, per
   account once logged in); a single checkout can include items from multiple sellers, which
   internally splits into one sub-order per seller sharing one payment; enter/select shipping
   address; select shipping method; pay via Stripe; receive order confirmation. Guests must
   register or log in at checkout before payment (cart contents carry over).

3. **Order Management** (Buyer) — view order history, track status per seller sub-order
   independently (one seller may ship before another), request a return/refund per sub-order,
   leave a review once a specific item is marked delivered (review is tied to a verified
   purchase via the order item, not open to anyone).

4. **Seller Onboarding** (prospective Seller) — apply to become a seller (store name, business
   details, bank/payout info); application is submitted to Admin for approval; the account cannot
   list products until approved. This is a single mode (apply → pending → approved/rejected), no
   variants.

5. **Product Management** (Seller) — CRUD own products/variants, manage stock and price, set
   active/inactive. Also supports bulk import/update via CSV, with three distinct modes the
   seller must explicitly choose per upload:
   - **Add-only** — new SKUs in the file are created; existing SKUs already in the catalog are
     left untouched (skipped, not updated).
   - **Full replace** — the file is treated as the seller's complete active catalog: SKUs in the
     file are created/updated, and any of the seller's currently-active products *not* present in
     the file are deactivated (soft-deleted, never hard-deleted — see data-model.md > Delete/
     cascade semantics).
   - **Attribute update** — updates price/stock (and other listed attributes) on existing SKUs
     matched by SKU only; never creates new products and never deactivates anything absent from
     the file. This is the "change everyone's price" case, distinct from both add and replace.

6. **Order Fulfillment** (Seller) — view incoming sub-orders (scoped to own seller ID only), mark
   as shipped with a tracking number, handle cancellations before shipment.

7. **Category & Catalog Governance** (Admin) — manage the category tree, review/approve or reject
   newly submitted products for policy compliance before they go live, moderate flagged reviews.

8. **Seller Approval & Oversight** (Admin) — approve/reject seller applications (case 4), suspend
   sellers for policy violations (suspension deactivates their listings but preserves order
   history), view seller performance, set a commission rate per seller or per category.

9. **Commission & Payouts** (Admin/Seller) — the platform calculates commission per order at the
   time of sale (rate resolved from seller-level override, else category default, else platform
   default). Payouts to sellers run through **Stripe Connect** (Standard or Express accounts):
   funds settle to the platform's Stripe account, commission is retained, and the seller's net
   amount is transferred to their connected account on a payout schedule (e.g. after the return
   window closes). *Note: this is an assumption, not something you specified — a true multi-seller
   payout split realistically needs Stripe Connect rather than manual bank transfers; flag if you
   want a simpler/manual payout process for v1 instead.*
