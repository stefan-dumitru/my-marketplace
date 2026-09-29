# Roadmap: Release 2 & Release 3

Release 1 is functionally complete (see [functional.md](functional.md) for what shipped). This
file plans the next two releases toward a commercially viable, real-life-ready app.

Framing:
- **Release 2 — Trust & Conversion.** Remove friction and reasons to bounce or distrust the app.
  This is where a stranger decides whether to type in a card number.
- **Release 3 — Scale & Growth.** The stuff that makes money grow once people already trust the
  app.

Two items in Release 3 (e-Factura, carrier integration) depend on real vendor accounts/contracts,
not just code, so they'll likely anchor that release's timeline more than anything else on this
list.

Out of scope for now (Release 4+ territory unless reprioritized): multi-currency, A/B testing
infrastructure, referral programs.

---

## Release 2 — Trust & Conversion

7 items. Rebalanced from the original 5 by pulling in the two lightest-effort items from
Release 3: CI/CD (a safety rail needed *before*, not after, real users start depending on
trust-critical features) and Wishlist (a low-effort conversion win that offsets the release's
one genuinely heavy item, the mobile-first pass).

| Area | Addition | Why |
|---|---|---|
| Auth | Google OAuth | Removes the #1 signup friction point |
| Auth | CAPTCHA — Cloudflare Turnstile over reCAPTCHA | Rate limiting stops brute force but not scripted signup/review spam; Turnstile is invisible/frictionless vs. reCAPTCHA's puzzle UX |
| UX | Mobile-first pass | Most marketplace traffic is mobile; needs a real Lighthouse-mobile audit, not just "responsive CSS exists" |
| Legal | Terms of Service, Privacy Policy, Returns Policy pages | Real payments + PII are being processed — this is a legal minimum before real users, not a nice-to-have |
| Product | Fix product gallery — only the *first* uploaded image ever renders on the product page, even though sellers can upload up to 8 | Currently a silent bug, not a missing feature — sellers are uploading images buyers never see |
| Infra | CI/CD with test gates + a staging environment | Deploying straight to prod on push is fine at 1 developer, but risky the moment Release 2's trust-critical features (OAuth, payments-adjacent flows) start shipping to real users — this needs to land before that happens, not after |
| Merchandising | Wishlist, "customers also bought" | Retention + conversion win at a fraction of the effort of Release 3's other items — balances the mobile-first pass's larger scope |

## Release 3 — Scale & Growth

6 items. What's left after the rebalance above — genuinely large, mostly external-dependency
efforts. e-Factura and carrier integration depend on real vendor accounts/contracts, not just
code, so they'll likely anchor this release's timeline more than anything else on the list.

| Area | Addition | Why |
|---|---|---|
| Search | Typo-tolerant/autocomplete search (Meilisearch or similar) | Current Postgres FTS + trigram fallback works but won't scale past a few thousand SKUs |
| Merchandising | Coupon codes / promotions engine / discounts | Standard commercial lever, currently no discounting mechanism at all |
| Seller tools | Real shipping-carrier integration (label generation, live tracking) | "Tracking number" is currently a free-text field with no verification |
| Support | Live chat or a proper dispute/ticketing flow | The only post-purchase recourse today is the return flow — no path for "wrong item," "damaged," billing disputes, etc. |
| Growth | Multi-language (RO/EN) | Only relevant if expanding beyond Romania — otherwise skip |
| Merchandising | Free-shipping subscription (Prime-style) — two-part: (1) introduce a real per-seller shipping cost at checkout, since none exists today (Stripe line items are currently built from product price alone), then (2) a Stripe Subscriptions plan that waives it | Proven retention/conversion lever; scoped as two parts because there's nothing to "waive" until a real shipping cost exists, and a multi-seller cart means shipping is naturally a per-`SellerOrder` cost, not a single order-level fee |


---

## Next step

Before building Release 2, flesh out each item above to the same level of detail as
[functional.md](functional.md)'s use cases (acceptance criteria, edge cases, exact scope) so
there's something concrete to build against, the same way the rest of `specifications/` works.
