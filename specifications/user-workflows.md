# User Workflows

Companion to [user-capabilities.md](user-capabilities.md) (what exists on each screen). This
file traces how those screens chain together into end-to-end paths for a Buyer, Seller, and
Admin, including the branch points that decide which way a path goes.

Legend: `├─`/`└─` = next step; an indented one below a step = a branch on some condition.

---

## 1. Buyer

### 1.1 Account lifecycle

```
Register → "check your email" → verify link
  ├─ expired/invalid → resend
  └─ valid → verified (required for checkout & seller applications; browsing/cart don't need it)

Log in → invalid creds / suspended / rate-limited, or success → /account

Forgot password → email sent (same response whether or not account exists, link expires 1h)
  → reset password → logged out of all other sessions/devices

Delete account
  ├─ has a seller profile → refused, contact support
  └─ else → confirm by typing email → anonymized (PII scrubbed; orders/invoices kept, PII-stripped,
     for tax records) → signed out
```

### 1.2 Shopping & checkout

```
Browse → product detail (/products/[slug])
  Shown:
      - image
      - category
      - name
      - "Sold by {seller}"
      - avg rating (hidden if no reviews)
      - brand
      - description
      - stock
      - full review list below.
  ├─ no variant matches selection → "unavailable", no buy control
  ├─ anonymous → "Log in to buy" → login → back to this product
  └─ logged in, in stock → pick quantity → Add to cart
     (server re-checks product active + variant stock even if the page was stale)

Cart → edit qty / remove (re-capped at live stock)
  ├─ empty → back to /products
  └─ email not verified → banner, must verify first
  → Checkout: pick/enter address → "Continue to payment"
     ├─ cart empty / product gone / insufficient stock → inline error, stays on page
     └─ ok → order created, stock decremented → Stripe Checkout
        ├─ session creation fails → order payment_failed → /checkout/failed → retry (same order)
        ├─ buyer abandons (session expires) → payment_failed → notified → retry available
        └─ payment succeeds → Order: paid, SellerOrders: confirmed → buyer+sellers notified
           → /checkout/success (shows "confirmed" once the webhook lands, "still confirming"
             if the buyer's redirect beat it — just refresh)
```

### 1.3 Post-purchase (per seller sub-order)

```
Order detail — action depends on sub-order status:
  pending/confirmed → nothing to do yet
  shipped          → tracking number shown
  delivered        → review (once per item, live immediately — no admin gate) and/or
                      return request (once per sub-order)
                      ├─ seller approves return → refund + restock → status: returned
                      └─ seller rejects → stays delivered, no refund
  cancelled        → "Refunded" / "Refund pending" (seller-initiated only — buyers can't
                      cancel an order themselves anywhere)
  returned         → terminal

Invoice download is available at any status.
```

### 1.4 Becoming a seller

```
/sell
  ├─ pending/rejected/suspended profile → status message, dead end (contact support)
  ├─ approved profile → redirected straight to /seller
  └─ no profile → submit application → admin reviews
     ├─ rejected → status message above
     └─ approved → role promoted, session bumped → seller dashboard unlocked
```

---

## 2. Seller

*(All of this requires an `approved` seller profile — see 1.4 for how that happens; anything
else bounces to `/sell`.)*

### 2.1 Products

```
Add product — 
   - name
   - category
   - brand
   - description
   - SKU (Stock Keeping Unit, unique per seller, then immutable),
   - image
   - price
   - stock.
  → this single submit also creates one default variant using that SKU/price/stock — real
    variants (Size/Color, etc.) are added afterward as a separate step
  → created as pending_review, not yet visible
     ├─ admin rejects → stays hidden
     └─ admin approves → active, visible on storefront
        → seller can now freely toggle Active ⇄ Inactive (only self-service status change)

Edit product — any field except SKU; goes live immediately, no re-moderation

Variants — add (SKU + attributes + price + stock) / delete
  ├─ would leave zero variants → refused
  └─ has order history → refused, zero the stock instead
```

### 2.2 Bulk import (CSV)

```
Choose mode: add_only (new SKUs only) / attribute_update (price+stock on existing only) /
full_replace (sync everything, deactivates active products missing from the file)
  ├─ <100 rows → processed immediately
  └─ ≥100 rows → background job → batch detail page, per-row outcome, emailed on completion
```

### 2.3 Order fulfillment

```
confirmed → ship (tracking required) → shipped → deliver → delivered
  → payout-eligible 14 days later (§2.4)
  → any later return request: approve (refund+restock) or reject

confirmed → cancel (only before shipping) → stock released, auto-refunded → cancelled
  (cancel/return-resolve are retry-safe — a repeat click after a partial failure only
  finishes whichever half didn't complete)
```

### 2.4 Payouts

```
Connect Stripe → onboarding → connected (no seller action after that)

delivered order → 14-day hold → eligible → picked up by the next release run
  (release itself is cron/admin-triggered, never seller-initiated)
  ├─ no Stripe account / transfer fails → payout marked failed, auto-retried next run
  └─ transfer succeeds → paid, seller notified
```

---

## 3. Admin

### 3.1 Sellers

```
pending application
  ├─ approve → role promoted, session bumped
  └─ reject

approved seller
  ├─ adjust commission override
  └─ suspend → deactivates all their active listings

suspended seller
  └─ reinstate (listings stay off — seller must reactivate manually)
```

### 3.2 Products

```
pending_review queue
  ├─ approve → goes live
  └─ reject → stays hidden
```

### 3.3 Reviews

```
buyer submits → live immediately, no admin step
  └─ admin, anytime after
     ├─ take down → hides it
     └─ restore (no-op if already in that state)
```

### 3.4 Categories

```
create/edit → name, parent (can't be self), image, default commission rate, active flag
  └─ deactivate → removed from pickers, not deleted
```

### 3.5 Payouts

```
weekly cron OR "run batch now" → same job either way
  └─ per seller, independently:
     ├─ no Stripe account → failed, no API call
     └─ has eligible orders → one Stripe transfer
        ├─ succeeds → paid
        └─ fails → failed, auto-retried next run
  (one seller's failure never blocks another's payout)
```

### 3.6 Reporting & audit

```
Reports
  └─ filter by range → GMV/commission/payout totals + per-seller breakdown → CSV

Audit log
  └─ read-only trail of every action above (approvals, moderation, payouts, shipments,
     refunds, payments, deletions) → CSV (capped 10k rows)
```

---

## Cross-category: one order, start to finish

```
Buyer pays → Order: paid, SellerOrder: confirmed
  → seller ships → shipped → delivers → delivered
     → buyer reviews (live instantly) and/or requests a return (seller approves/rejects)
     → 14 days clean → payout-eligible → next release run pays the seller

Alternative: seller cancels while still confirmed → refunded, stock released, cancelled
  (never reaches delivered or payout)
```
