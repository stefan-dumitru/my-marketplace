# Performance Requirements

Only fill in numbers you actually care about. A vague "should be fast" gives Claude nothing to
design against — a target latency or load figure does. Leave `[TODO]` rather than guessing.

## Response Time Targets

| Operation | Target (p50) | Target (p95) | Notes |
|---|---|---|---|
| Page load / initial render | 1.5s | 3s | Storefront pages (SSR/ISR); measured as time-to-interactive on a mid-tier mobile connection |
| API read (simple) | 100ms | 400ms | E.g. fetch product detail, fetch cart |
| API write | 200ms | 600ms | E.g. add to cart, update product, submit review |
| Product search / listing with filters | 200ms | 800ms | Full-text search + filter combination is the heaviest common read |
| Checkout (payment intent creation → confirmation) | 500ms | 1.5s | Includes the round trip to Stripe; excluded from the general "API write" bucket since it's inherently a slower external call |

*These are placeholder targets reflecting typical ecommerce expectations, not measured data —
there's no existing traffic to benchmark against yet. Treat as the design target, and revisit
once real usage data exists.*

## Scale Expectations

- Expected concurrent users: ~500 concurrent at launch, ~5,000 at 1 year — a placeholder
  assumption for a regional marketplace launch, not a validated forecast; revisit once there's a
  marketing/launch plan with real projected traffic.
- Expected data volume: catalog could reach 50k-100k+ product SKUs across all sellers within a
  year as more sellers onboard; orders grow roughly linearly with GMV, expect tens of thousands
  of orders/month at steady state post-launch.
- Read/write ratio: heavily read-skewed — browsing/search traffic likely outweighs
  checkout/write traffic by roughly 20:1.
- Known spiky load pattern: flash-sale/seasonal events (Black Friday, end-of-year holidays)
  similar to emag.ro's own "Black Friday" event — plan for 5-10x normal traffic during those
  windows, concentrated on product listing, search, and checkout.

## Constraints This Implies

- Pagination required on: product listings/search results, order history (buyer, seller, admin),
  review lists, admin seller list, notification center, audit log.
- Caching needed on: category tree, product listing/detail pages, homepage banners/featured
  products.
- Caching TTL: category tree — 1 hour (rarely changes, and can be force-revalidated on admin
  edit); product listing pages — 5 minutes, with on-demand revalidation triggered immediately on
  product create/update/deactivate so price/stock changes don't wait out the TTL; homepage — 5
  minutes.
- Background/async processing needed for: transactional email sends, bulk product import
  processing, payout calculation/transfer, daily/monthly sales rollups, product image
  processing/resizing.
- Database indexing priorities (derived from data-model.md's query patterns): `Product(sellerId,
  status)`, `Product(categoryId, status)`, full-text index on `Product(name, description)`,
  `Order(buyerId)`, `SellerOrder(sellerId, status)`, `OrderItem(sellerOrderId)`,
  `ImportBatchRecord(importBatchId)`.
- Debounce interval for search/filter inputs that trigger an API call: 400ms.

## Frontend Performance Budget

- Initial JS/CSS bundle size budget: < 200KB gzipped for storefront pages (the highest-traffic,
  most latency-sensitive surface); the seller/admin dashboards can be somewhat heavier since
  they're behind auth and used by a much smaller, more tolerant audience.
- Core Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1 — standard "Good" thresholds,
  targeted on the storefront and checkout flow specifically (these are the pages that affect
  conversion).
- Image strategy: Next.js `<Image>` component throughout, served as WebP/AVIF with responsive
  `srcset`, lazy-loaded below the fold; product images stored at a few fixed sizes (thumbnail,
  card, full) generated on upload rather than resized on every request.
- Font loading strategy: a single self-hosted variable font (see ui-guidelines.md for the actual
  family) with `font-display: swap` and preloading on the critical path, to avoid blocking
  first render.

## Bulk / File Operation Performance

- Expected file size / row count range: seller product CSV imports up to ~10,000 rows.
- Processing time target and async threshold: imports under 100 rows process synchronously
  (seller sees the result immediately in the UI); anything at or above 100 rows moves to a
  background job (`ImportBatch`, per operations.md > Background Jobs) with the seller notified on
  completion, so a large import never blocks an HTTP request or risks a timeout.
