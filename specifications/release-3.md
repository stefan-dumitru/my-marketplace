# Release 3 Specification: Scale & Growth

Detailed specs for the Release 3 items in [roadmap.md](roadmap.md), written one batch at a time as
each is picked up. Same format as [release-2.md](release-2.md): scope, acceptance criteria, edge
cases.

Specced so far (build order): **1. Typo-tolerant search + autocomplete → 2. Coupon codes /
discounts → 3. Shipping cost + free-shipping subscription → 4. Carrier integration (FanCourier) →
5. Disputes / ticketing.** Multi-language is skipped unless the app expands beyond Romania.

---

## 1. Typo-tolerant search + autocomplete

**Problem:** Search today (`src/server/data/products.ts`) is Postgres full-text search
(`searchVector` + `websearch_to_tsquery('simple', …)`) with a `pg_trgm` `word_similarity` fallback
(threshold 0.35) when FTS returns nothing. That already tolerates some typos, but: there is no
as-you-type autocomplete, ranking is basic `ts_rank`, and the roadmap's concern is that this
won't hold up past a few thousand SKUs.

**Decision to confirm before building — Meilisearch vs. staying in Postgres:**
- *Meilisearch (roadmap's choice):* best typo tolerance/ranking/instant suggestions, but adds a
  new service to host (Railway service or Meilisearch Cloud), a sync pipeline, and a new line in
  CLAUDE.md's tech stack.
- *Postgres-only (cheaper alternative):* add a prefix-matching suggestions endpoint on the
  existing trigram index. No new infra, but weaker ranking and it hits the scaling ceiling the
  roadmap is worried about.
- **Recommendation:** Meilisearch, matching the roadmap. Everything below assumes it; the
  autocomplete UI and API contract are identical either way.

**Scope:**
- A Meilisearch index `products` containing only storefront-visible products (active, from an
  approved seller): `id`, `slug`, `name`, `description`, `brand`, category name/slug, `images[0]`,
  min variant price, average rating, seller store name.
- Searchable attributes (priority order): `name`, `brand`, `category`, `description`. Filterable:
  category, brand, price, rating. Sortable: price, rating, newest.
- **Sync, Prisma stays the source of truth.** Index writes happen as Inngest background jobs
  (already in the stack), triggered when a product is created/updated/approved/deactivated, when
  its seller is suspended/reinstated, and when a review changes its rating. A nightly full
  reindex job is the safety net for drift. A `scripts/reindex-search` command does the initial
  backfill.
- **Autocomplete:** the header/search input shows up to 6 suggestions after 2+ characters
  (debounced ~200ms): product name + thumbnail + price, plus up to 3 matching category/brand
  chips. Enter or "See all results" goes to the existing `/products?q=…` page; clicking a
  suggestion goes straight to the product.
- **Results page:** `/products?q=…` queries Meilisearch instead of the Postgres FTS path, keeping
  the existing filters (category, brand, price, min rating) and pagination working unchanged.
- **Graceful fallback:** if Meilisearch is unreachable, `/products?q=…` falls back to the current
  Postgres FTS/trigram path and autocomplete silently hides. Search never hard-fails.
- New suggestions endpoint: `GET /api/search/suggest?q=…` — rate-limited per CLAUDE.md's
  baseline (expensive, unauthenticated endpoint), Zod-validated query, returns only public
  fields.

**Acceptance criteria:**
- [ ] "ipone" / "samsng" / "wireles" find the intended products (1–2 character typos).
- [ ] Autocomplete appears within ~150ms of the debounce firing, on mobile and desktop, and is
      fully keyboard-operable (arrow keys, Enter, Esc) with correct ARIA combobox roles.
- [ ] A product deactivated, rejected, or belonging to a suspended seller disappears from both
      suggestions and results within one sync cycle (target: seconds, hard limit: the nightly
      reindex).
- [ ] Existing filters/pagination on `/products` behave identically with `q` set.
- [ ] Meilisearch down → results page still works via Postgres fallback; no error shown to
      buyers.
- [ ] Meilisearch master/admin key is server-side only; the browser never talks to Meilisearch
      directly (suggestions go through our API route).
- [ ] No new Lighthouse regressions on the header (autocomplete JS loads lazily, not in the
      initial bundle).

**Edge cases:**
- Empty/whitespace query → no suggestions request fired.
- Query containing Postgres/Meilisearch syntax characters → treated as plain text.
- Product with no images / no variants → still indexed, suggestion renders placeholder / "price
  unavailable" rather than crashing.
- Index lags behind a seller edit → results page always links to the live product page, which
  reads Postgres, so a stale index can show an old name briefly but never a wrong price at
  checkout.
- Romanian diacritics (ș/ț/ă/â/î) — index and query must match with and without diacritics
  (Meilisearch handles this by default; add an explicit test).

---

## 2. Coupon codes / discounts engine

**Problem:** There is no discounting mechanism at all. `createOrderFromCart`
(`src/server/data/orders.ts`) snapshots `unitPriceSnapshot`, computes `lineTotal`, per-line
`commissionAmount`, and `payoutAmount = subtotal − commissionAmount`; Stripe line items are built
in `order-service.ts` from `unitPriceSnapshot × 100`. Any discount has to flow through all of
these consistently, including refunds and payouts.

**Decision to confirm before building — who funds the discount:**
- **Platform-funded (recommended for this release):** admin-created codes; the *platform*
  absorbs the discount. Sellers' `subtotal`, `commissionAmount` and `payoutAmount` are computed on
  pre-discount prices exactly as today, so sellers are never out of pocket and the payout/report
  code needs no change. The discount comes out of the platform's commission margin.
- *Seller-funded:* sellers create codes for their own products; discount reduces their payout.
  More useful commercially but touches commission/payout/reporting for every order — defer to a
  later release.
- Everything below assumes platform-funded.

**Scope:**
- **Coupon model** (`Coupon`): `code` (unique, case-insensitive, stored uppercase), `type`
  (`percentage` | `fixed_amount`), `value`, optional `minOrderAmount`, optional `maxDiscountAmount`
  (cap for percentage codes), `startsAt`, `expiresAt`, `maxRedemptionsTotal`,
  `maxRedemptionsPerUser`, `firstOrderOnly` flag, `isActive`, `createdByUserId`. Scope in v1 is
  the whole cart (no per-product/category/seller targeting — flagged as a later extension).
- **Redemption model** (`CouponRedemption`): `couponId`, `userId`, `orderId`, `discountAmount`,
  `createdAt`. Source of truth for usage limits.
- **Order changes:** `Order` gains `couponId?`, `couponCodeSnapshot?`, `discountAmount`
  (default 0). `totalAmount` becomes `Σ sellerOrder.subtotal − discountAmount`. `SellerOrder`
  values are unchanged (platform-funded).
- **Discount allocation:** the order-level discount is allocated across `SellerOrder`s
  proportionally to subtotal (largest-remainder rounding so allocated cents sum exactly to the
  discount) and stored on each `SellerOrder` as `discountAllocated`. This is needed so a
  cancellation/return refunds the buyer only what they actually paid for that sub-order.
- **Buyer UX:** a "Promo code" field on the cart/checkout summary. Apply validates server-side and
  shows the discount line and new total (or a specific error: expired, not yet active, minimum
  not met, already used, limit reached, not valid for first order). Remove-code link. One code
  per order in v1.
- **Stripe:** the discount is applied by passing Stripe a Checkout Session discount (a one-off
  Stripe coupon created for the exact amount, or a reduced-price line item) so the amount Stripe
  charges equals `Order.totalAmount`. The webhook already trusts our Order row, not Stripe's
  display.
- **Admin UI** (`(admin)` group): list / create / edit / deactivate coupons, see redemption
  count and total discount given per code. Every create/edit/deactivate writes an `AuditLog`
  row, per the existing admin-action convention. Codes are never hard-deleted once redeemed
  (deactivate only).
- **Refunds:** cancelling or approving a return on a `SellerOrder` refunds
  `subtotal − discountAllocated` for that sub-order, via the existing Stripe refund call in
  `seller-order-service.ts`. Redemption is *not* restored on a partial cancel; it is released
  only if the entire order is cancelled before payment completes.

**Acceptance criteria:**
- [ ] Percentage and fixed-amount codes both compute correctly, honoring `maxDiscountAmount` and
      never taking the total below 0.
- [ ] Discount is re-validated server-side at checkout creation *and* again when the payment is
      confirmed — a code that expired or hit its limit between "Apply" and "Pay" is rejected
      cleanly, not silently honored.
- [ ] Concurrent redemptions of the last remaining use of a code never over-redeem (conditional
      increment / unique constraint, same pattern as the atomic stock decrement in
      `createOrderFromCart`).
- [ ] Stripe charge amount == `Order.totalAmount` for all cases, including multi-seller carts
      and rounding edge cases (amounts in minor units, no float drift).
- [ ] Seller `subtotal`/`commissionAmount`/`payoutAmount` are identical with and without a coupon
      (verified by test).
- [ ] Cancelling one of two sub-orders refunds that sub-order's `subtotal − discountAllocated`
      exactly; allocated amounts across sub-orders sum to the order discount to the cent.
- [ ] Order confirmation email/order detail page show the discount line.
- [ ] Code entry is rate-limited (brute-forcing codes is a real attack) and error messages don't
      reveal whether an inactive-vs-nonexistent code exists to unauthenticated users.
- [ ] Admin create/edit validates with the shared Zod schema (client + server), and every admin
      action is audit-logged.
- [ ] Vitest coverage for: each validation failure, allocation rounding, concurrent redemption,
      refund-with-discount, and the seller-unchanged invariant.

**Edge cases:**
- Cart changes after a code is applied (item removed, quantity changed, total drops below
  `minOrderAmount`) → code is re-evaluated on every cart/checkout render and dropped with an
  explanation if no longer valid.
- Abandoned checkout (Stripe session created, never paid) → **as built:** the redemption is held
  with its order for as long as the order exists, including a `payment_failed` order that can
  still be retried (retry reuses the order's frozen discount). This matches how stock is already
  treated (also not released on checkout expiry). A buyer who tries to reuse a per-buyer-limited
  code while an unpaid order holds it is told so explicitly and pointed at that order.
- `fixed_amount` larger than the cart total → discount capped at the cart total.
- Coupon deactivated or expired while an order is `pending_payment` → payment confirmation uses
  the discount frozen on the Order row; the order isn't retroactively re-priced.
- GDPR anonymization of a user (`anonymizeUserById`) → `CouponRedemption` rows are kept (they
  back financial records) but carry only the already-anonymized `userId`.
- `firstOrderOnly` → "first order" means no prior order in a paid-or-later status for that user;
  cancelled/unpaid orders don't count.
- Reports → **as built:** the admin dashboard's GMV is gross (pre-discount) and a separate
  "Discounts given" tile shows the month's discounts, so platform margin stays explainable. Seller
  reports and the sales rollups already sum `SellerOrder.subtotal`, which coupons never change.

---

## 3. Shipping cost + free-shipping subscription

**Problem:** Checkout charges product prices only — there is no shipping cost anywhere
(`createStripeSessionForOrder` builds Stripe line items from `unitPriceSnapshot` alone), so there
is nothing for a subscription to waive. This item is two parts, built in order, each shippable on
its own: **(A)** a real per-seller shipping fee, **(B)** a monthly Stripe subscription that waives it.

**Decisions (confirmed):**
- Flat fee **per seller sub-order** (a 3-seller cart pays 3 fees), one platform-wide amount
  (placeholder **15.00 RON**, a constant in `lib/constants.ts`; changing it is a deploy, not an admin
  setting, in v1). Already-placed orders are never repriced.
- **The seller keeps the shipping fee**: it is added to `payoutAmount` and no commission is taken on
  it (the seller does the shipping).
- For a subscriber the buyer pays 0, but the **platform still pays the seller the full fee**
  (funded by subscription revenue) — sellers' payouts are identical for subscribers and
  non-subscribers, the same principle as platform-funded coupons.
- One plan: **20 RON / month** (the price you created in Stripe; 19 was the original placeholder),
  cancel anytime. The price lives in the Stripe Price object and the page reads it from there, not
  from code.

### Part A — Shipping fee

**Scope:**
- `SellerOrder` gains `shippingFee` (the fee owed to the seller, always the full amount) and
  `shippingCharged` (what the buyer actually paid: equal to `shippingFee`, or 0 when waived).
  `Order` gains `shippingAmount` (= Σ `shippingCharged`). Both default 0, so existing orders are
  unaffected.
- `Order.totalAmount = Σ SellerOrder.subtotal + Order.shippingAmount − Order.discountAmount`.
- `SellerOrder.payoutAmount = subtotal − commissionAmount + shippingFee`. Commission is computed on
  goods only.
- Coupons discount **goods only**, never shipping; the pro-rata allocation is unchanged. The
  2.00 RON minimum-charge guard applies to the final payable total.
- Stripe: each sub-order's shipping is a separate line item ("Shipping — <store name>") so Stripe
  charges exactly `Order.totalAmount`; a waived fee is simply omitted.
- Cart, checkout, order detail, invoice PDF and the Stripe session all show a shipping line.
- **Refunds:** cancelling a sub-order refunds `subtotal − discountAllocated + shippingCharged`
  (nothing shipped). An approved return refunds goods only (`subtotal − discountAllocated`);
  shipping is non-refundable on returns.

**As built (Part A):** exactly as specified above. The fee lives in `SHIPPING_FEE_PER_SELLER`
(`lib/constants.ts`); `lib/shipping.ts` is the one shared helper for cart/checkout display. Admin
dashboard GMV stays goods-only (shipping is excluded, since it belongs to sellers).

### Part B — Subscription

**Scope:**
- `User` gains `stripeCustomerId?`. New `Subscription` model: `userId` (unique), `stripeSubscriptionId`
  (unique), `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`, timestamps.
- Subscribe: a "Free shipping" page / cart prompt starts a Stripe Checkout session in
  `mode: "subscription"`. Manage/cancel through the Stripe Billing Portal (no custom cancel UI).
- Webhooks (the existing handler already ignores sessions without `metadata.orderId`):
  `checkout.session.completed` (subscription mode), `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`. All writes idempotent and keyed by
  Stripe subscription id, same convention as the payment webhooks.
- **Entitlement** = a `Subscription` row with status `active` (or `trialing`) **and**
  `currentPeriodEnd` in the future. `past_due` / `canceled` / `unpaid` lose the benefit. A
  subscriber who cancels keeps it until `currentPeriodEnd`.
- Entitlement is evaluated **inside the checkout transaction** from the database (never from
  anything the client sends) and the result is frozen on the order (`shippingCharged`).
- Cart/checkout show the shipping fee with a "free with subscription" hint for non-subscribers and
  a "Free shipping (subscription)" line for subscribers.
- Admin dashboard: active subscribers count and "shipping subsidized" this month (fees owed to
  sellers minus fees buyers paid — the platform's cost of the benefit). Subscription *revenue* is
  deliberately not duplicated here; it lives in the Stripe dashboard.

**Acceptance criteria:**
- [ ] A 2-seller cart is charged 2 × the fee; Stripe charge amount == `Order.totalAmount` to the cent.
- [ ] A subscriber is charged 0 shipping, yet each seller's `payoutAmount` is identical to the
      non-subscriber order (verified by test).
- [ ] Coupon + shipping together: discount never reduces shipping; total matches Stripe.
- [ ] Cancel refunds goods + shipping charged; approved return refunds goods only; sums never exceed
      what Stripe collected.
- [ ] A subscription that lapses between viewing the cart and paying is re-evaluated at checkout and
      the buyer is shown the real total; an order already placed keeps its frozen shipping.
- [ ] Webhook redelivery / out-of-order events never corrupt subscription state; status only moves
      forward by Stripe's own `current_period_end`/status, and events for unknown customers are
      ignored safely.
- [ ] Only the owning user can open their Billing Portal session (rate-limited, server-side
      customer lookup — never a customer id from the client).
- [ ] GDPR deletion (`anonymizeUserById`) cancels the Stripe subscription first; the local row is
      kept anonymized for financial records.
- [ ] Orders placed before this release render and refund exactly as before (shipping fields 0).

**Edge cases:**
- Existing `payment_failed` order retried later → uses the shipping frozen on the order, even if
  entitlement has since changed.
- Fee amount changes after an order is placed → no effect on that order.
- User subscribes while an unpaid order exists → that order keeps its frozen (unwaived) shipping.
- Stripe Billing Portal and subscriptions need configuration in the Stripe dashboard (test mode
  first): one Product + recurring Price, portal enabled with cancellation allowed, and the three
  subscription webhook events added to the existing endpoint.

---

## 4. Real shipping-carrier integration (FanCourier)

**Problem:** Today, `trackingNumber` on a `SellerOrder` is a free-text field with no verification or
link to any real carrier. A buyer sees a number that may be fake, incomplete, or unrecoverable if
the seller forgets to enter it. There is no live tracking, no proof of delivery, and no
carrier-driven notifications when the parcel moves.

**Decision to confirm before building — which carrier and integration depth:**
- **FanCourier (Romania's largest parcel carrier, recommended):** has a developer API for label
  generation and tracking lookups, handles most Romanian domestic and international shipments, and
  is already familiar to Romanian buyers. Alternative: DPD or GLS if you prefer, the integration
  pattern is identical.
- **API-based with real label generation (recommended):** sellers generate labels through the API,
  which assigns a real FanCourier tracking number, returns a PDF label to print/scan, and stores
  the number on the order. Live tracking queries use the tracking number to fetch current parcel
  status from FanCourier. This proves the shipment is real and lets buyers track live.
- Alternative (deferred to v2): manual entry + webhook sync (seller still types the number, but
  webhooks from FanCourier auto-update tracking status). Simpler for v1, but doesn't solve the
  "fake number" problem.
- Everything below assumes API-based.

**Scope:**
- **Admin setup:** a settings page where the platform admin configures FanCourier API credentials
  (API username/password, test vs. production mode). Stored encrypted in the database or as
  environment variables. Only one credential set per environment (v1 scope).
- **Seller shipping flow:** when a `SellerOrder` transitions from `paid` to `confirmed` (or during
  an explicit "Ship now" action), the seller chooses:
  - Which carrier (FanCourier for v1, hardcoded in the UI but prepared for multi-carrier later)
  - Recipient address (pre-populated from the order's `shippingAddressSnapshot`)
  - Optional: special instructions (fragile, signature required, etc.)
  - Click "Generate label" → calls FanCourier API → gets back a tracking number and PDF label URL
  - The `SellerOrder.trackingNumber` is populated with the real FanCourier number
  - `SellerOrder.status` transitions to `shipped` (existing state)
  - Label PDF is stored as a URL (Vercel Blob or a redirect to FanCourier's own CDN, TBD)
  - Buyer is notified: order confirmation email now includes tracking link / QR code
- **Tracking display:** order detail page shows the tracking number + a link to FanCourier's
  public tracking URL. A "live tracking" section polls or displays FanCourier's current status
  (in transit, out for delivery, delivered, exception, etc.) with last-update timestamp.
- **Tracking sync:** a background job (Inngest) runs every 1–2 hours and polls FanCourier's
  tracking API for all active shipments (status not `delivered` or `exception_resolved`). Updates
  are stored on the `SellerOrder` in a new `lastTrackedAt` field. On status change (e.g.,
  "in transit" → "out for delivery"), the buyer is notified via email (from Resend).
- **Return shipments (future):** if a return is approved, a return label can be generated so the
  buyer can send the parcel back. Deferred to v2 scope for now (out of scope for this increment).
- **Error handling:** if the FanCourier API is down or rejects a label request (e.g., invalid
  address), the seller is shown a clear error. They can retry. No order is left in a broken state.
  Fallback: seller can manually type the tracking number (same as today) if the API is persistently
  down, but the UI warns "this number is not verified."
- **Data model:**
  - `SellerOrder.trackingNumber` → already exists, now populated by API (not free-text)
  - `SellerOrder.lastTrackedAt` (new) → timestamp of the last successful tracking status fetch
  - `SellerOrder.labelUrl` (new) → URL to the shipping label PDF (or null if not yet generated)
  - Tracking history: store past statuses? (deferred to v2 if needed; for v1, just the current
    status + `lastTrackedAt` is enough)

**Acceptance criteria:**
- [ ] Admin can set FanCourier credentials (username, password, environment: test/production) via
      a settings page or environment variables, encrypted at rest.
- [ ] Seller generates a label: the FanCourier API assigns a tracking number, returns a PDF URL,
      and the `SellerOrder.trackingNumber` is populated with the real carrier number.
- [ ] Order detail page shows the tracking number and a working link to FanCourier's public
      tracking page, correctly formatted for the carrier.
- [ ] A background job fetches tracking status from FanCourier for all active shipments, updates
      `lastTrackedAt`, and sends the buyer an email when status changes (e.g., "Your parcel is on
      its way" when status moves to "in transit").
- [ ] If the FanCourier API is unreachable, the seller gets a clear error and can retry or fall
      back to manual entry with a warning.
- [ ] Tracking statuses are displayed to the buyer in plain language (e.g., "In transit",
      "Out for delivery", "Delivered") with the last update time.
- [ ] Concurrent label generation (two sellers generating for different orders simultaneously)
      never causes a race condition or duplicate shipment.
- [ ] A seller who updates a `SellerOrder` (e.g., changing the address) after a label is generated
      sees that the tracking number is now stale and is given the option to cancel the shipment and
      regenerate (or a warning, TBD by UX).
- [ ] Test mode (FanCourier sandbox) works without production credentials, and mode is never
      mixed (all calls in one request use the same mode).
- [ ] GDPR: order data (shipping address) is anonymized per the existing flow; the tracking number
      and label URL are kept in financial records.

**Edge cases:**
- Address validation: FanCourier API may reject an address as undeliverable. The seller is told
  why (e.g., "Invalid postal code") and must correct it before retrying.
- Tracking not updating: FanCourier's tracking data lags by a few hours. The buyer sees
  "Last update: N hours ago" to set expectations.
- Parcel exception (lost, damaged, returned): status changes to an exception state. Buyer is
  notified and the seller is alerted in their dashboard. Dispute/ticketing flow (Release 3 item 4)
  would handle the resolution path.
- Return shipments: out of scope for v1 (seller uses manual return label for now).
- Cancelling a shipped order: the tracking number is kept for financial records, but FanCourier
  must be notified that the shipment should not proceed (if it hasn't shipped yet). If it has
  already shipped, a return label is the resolution (future).
- Multiple sellers in one order: each `SellerOrder` can have a different carrier in the future,
  but v1 assumes all orders use FanCourier (hardcoded in UI).

### As built (deviations from the plan above)

- **Tracking numbers only come from labels.** The seller cannot type a tracking number at all: the
  "Mark as shipped" step shows the number created with the label (read-only) and is disabled until a
  label exists. The server enforces the same rule (an order ships only if it has both a tracking
  number and a label route), and a unique index guarantees a label's tracking number can belong to
  only one order. Older orders whose number was typed by hand are unaffected (the index covers rows
  with a label). Other carriers and AWBs created outside the app are not supported.
- **FAN Courier API v2.0 reality:** one host (`api.fancourier.ro`), bearer token from `POST /login`
  (24h), shipments via `POST /intern-awb`, label PDF via `GET /awb/label`, tracking via
  `GET /reports/awb/tracking`. There is no sandbox host, so "test" vs "production" are two
  credential sets; `CARRIER_ENVIRONMENT=production` selects the live one (default `test`).
- **Credentials:** username and password are encrypted with AES-256-GCM
  (`CARRIER_ENCRYPTION_KEY`); the numeric `clientId` is stored in plain text. The admin page never
  receives the password.
- **Labels are not stored.** The API returns no label URL, so `SellerOrder.labelUrl` holds the
  route `/api/seller/orders/[id]/label`, which authorizes the seller and streams the PDF from FAN
  Courier on demand (the label contains the recipient's address).
- **Address matching:** buyer-typed county and city are resolved against FAN Courier's county and
  locality lists (diacritics and prefix tolerant, Bucharest sectors collapse to "Bucuresti") before
  a shipment is created; unknown names produce a specific error for the seller.
- **Status mapping:** latest event id maps to REGISTERED / IN_TRANSIT / OUT_FOR_DELIVERY /
  DELIVERED / EXCEPTION / RETURNED (see `mapEventToStatus` in `src/lib/fancourier.ts`).
- **Not built:** AWB cancellation, return labels, tracking history, label regeneration after an
  address change.

---

## 5. Disputes / ticketing

**Problem:** The only post-purchase recourse today is the return flow, which only starts after
delivery and only covers "I want to send it back". There is no path for "it never arrived", "it
arrived damaged", "wrong item", "not as described" or a billing problem, and no way for the buyer
and seller to talk to each other or for an admin to rule on it.

**Decisions to confirm before building:**
- **Ticketing, not live chat.** A structured dispute with a message thread per sub-order. Live chat
  is out of scope (needs real-time infrastructure and staffing).
- **One dispute per `SellerOrder`.** Sellers fulfil independently, so a buyer disputes the part
  from one seller, not the whole order.
- **Disputes vs returns:** a return request is "change of mind / send it back" and stays as is. A
  dispute is "something is wrong". If a return on the same sub-order is approved and refunded, a
  dispute can't be opened (nothing left to resolve); an open dispute blocks a new return request
  until it is closed.
- **Who decides:** the seller gets the first chance to resolve; the admin rules when it escalates.
- **Money:** resolutions that refund reuse the existing Stripe refund path for that sub-order.

**Scope:**
- **Opening:** the buyer clicks "Report a problem" on a sub-order in their order page. Eligible
  when the sub-order is `shipped` or `delivered`, or `confirmed` and unshipped for more than 7 days
  ("seller isn't shipping"). Window: 30 days after delivery, or 60 days after the order if it was
  never delivered. Fields: reason (`not_received`, `damaged`, `wrong_item`, `not_as_described`,
  `billing`, `other`), description (required, 20-2000 chars), up to 4 photos (images only, same
  upload validation as product images).
- **Thread:** buyer, seller and admin can add messages (text, optional images) while the dispute is
  open. Every message notifies the other parties in-app and by email (queued through Inngest).
- **Seller response:** the seller has 3 business days to respond. Options: reply, offer a
  resolution (full refund, a partial refund of an amount they choose, or a replacement handled
  outside the app), or contest the claim with a reason.
- **Escalation:** automatic when the seller doesn't respond in time (Inngest scheduled check), or
  when the buyer clicks "Escalate to marketplace" after a seller reply. The admin sees it in a
  queue.
- **Admin resolution:** full refund, partial refund (amount up to what the buyer actually paid for
  that sub-order: subtotal minus its coupon share plus its shipping fee), or reject. A reason is
  required and shown to both parties. Each decision writes an audit-log entry.
- **Statuses:** `open` → `seller_responded` → `escalated` → `resolved_refund` /
  `resolved_partial_refund` / `resolved_rejected`, plus `withdrawn` (buyer cancels) and `closed`
  (seller-offered resolution accepted). Terminal statuses reject further messages.
- **Visibility:** the buyer sees their disputes in their account; the seller sees a "Disputes" list
  in the dashboard with an open-count badge; the admin sees an escalated queue with filters.
- **Data model:** `Dispute` (id, `sellerOrderId` unique, `buyerId`, reason, description, status,
  `resolutionType`, `resolutionAmount`, `resolutionNote`, `openedAt`, `sellerRespondBy`,
  `escalatedAt`, `resolvedAt`, `resolvedByUserId`) and `DisputeMessage` (id, `disputeId`,
  `authorId`, `authorRole`, body, `imageUrls[]`, `createdAt`).

**Acceptance criteria:**
- [ ] A buyer can open a dispute only on their own eligible sub-order; a second dispute on the same
      sub-order is rejected, and a non-owner gets a 404, not a 403.
- [ ] Opening validates reason, description length and images with a shared Zod schema, and is
      rate-limited per user.
- [ ] The seller is notified in-app and by email with the response deadline; the buyer gets a
      confirmation.
- [ ] Messages are only readable and writable by the buyer, the seller of that sub-order and
      admins, enforced in the data-access layer (seller scoping by `sellerId`, as elsewhere).
- [ ] If the seller does not respond by the deadline, the dispute escalates automatically and
      appears in the admin queue; the buyer can also escalate manually after a seller reply.
- [ ] An admin full or partial refund creates exactly one Stripe refund (idempotent and safely
      re-clickable after a transient failure, same pattern as cancellation and returns) for the
      right amount, and never more than the buyer paid for that sub-order across all refunds.
- [ ] A rejected or resolved dispute shows the admin's reason to both parties and accepts no more
      messages.
- [ ] Every status change by a seller or admin is audit-logged.
- [ ] The buyer can withdraw an open dispute.
- [ ] GDPR: account deletion keeps disputes (financial/legal record) but scrubs the buyer's
      identity and removes message images.
- [ ] Uploaded images are validated (type, size) before storage and are only served to the parties
      of the dispute.

**Edge cases:**
- **Already refunded or cancelled sub-order:** can't be disputed; the button isn't shown.
- **Seller account suspended mid-dispute:** the dispute escalates immediately.
- **Seller payout already paid** when a refund is granted: the platform pays the refund and the
  seller's balance is debited against their next payout (confirm this matches how returns handle
  it today before building).
- **Payout timing:** an open dispute should hold that sub-order's payout from the next batch
  (needs a check in the payout batch query).
- **Several partial refunds:** the cap applies to the sum of all refunds.
- **Concurrent resolution:** two admins resolving at once, or the seller offering a refund while an
  admin rules; resolution is a conditional status update and the first one wins.
- **Carrier exception:** a FAN Courier `EXCEPTION` or `RETURNED` status could pre-fill or suggest a
  `not_received` dispute; out of scope for v1, noted for later.
- **Stripe chargebacks** (a buyer disputing with their bank) are a different thing, handled via
  Stripe webhooks, and are out of scope here.

**Out of scope:** live chat, disputes spanning several sellers at once, carrier claims, automatic
reimbursement from the seller, buyer-seller messaging outside a dispute.

**Open questions for you:**
1. Is a 3 business day seller response window OK, or should it be longer?
2. Should admins be able to ask the buyer for more evidence (a `needs_info` status), or is the
   thread enough?
3. Do you want a fee or penalty on sellers who lose disputes? (Assumed no for v1.)

---

## Cross-cutting notes

- All four items add dependencies/data surfaces that need matching updates to
  [security.md](security.md) (public suggest endpoint, coupon-code rate limiting, FanCourier
  credentials),
  [data-model.md](data-model.md) (`Coupon`, `CouponRedemption`, `Subscription`, new `Order`/`SellerOrder`
  columns), and [operations.md](operations.md) (Meilisearch hosting, FanCourier API, Inngest tracking
  job).
- Suggested order: search first (no money-path changes), coupons second (touches checkout/payouts/refunds,
  benefits from CI), shipping/subscription third (touches order totals), carrier integration fourth
  (builds on stable order/seller-order model).
