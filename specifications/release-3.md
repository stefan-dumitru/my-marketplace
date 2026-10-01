# Release 3 Specification: Scale & Growth

Detailed specs for the Release 3 items in [roadmap.md](roadmap.md), written one batch at a time as
each is picked up. Same format as [release-2.md](release-2.md): scope, acceptance criteria, edge
cases.

Specced so far (build order): **1. Typo-tolerant search + autocomplete → 2. Coupon codes /
discounts.** The remaining roadmap items (carrier integration, disputes/ticketing, multi-language,
free-shipping subscription) get their own sections here when they're started.

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

## Cross-cutting notes

- Both items add a dependency/data surface that needs matching updates to
  [security.md](security.md) (public suggest endpoint + coupon-code rate limiting),
  [data-model.md](data-model.md) (`Coupon`, `CouponRedemption`, new `Order`/`SellerOrder`
  columns), and [operations.md](operations.md) (Meilisearch hosting, backups, reindex job).
- Suggested order: search first (no money-path changes), coupons second (touches checkout,
  payouts, and refunds, so it benefits from CI already being in place).
