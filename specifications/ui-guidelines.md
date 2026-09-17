# UI / Design Guidelines

Only the cross-feature, durable design decisions go here. Layout of an individual screen belongs
in that feature's Plan Mode session, informed by this file — not spec'd upfront here.

## Design System

- Component library / design system: Tailwind CSS + shadcn/ui, matching the Next.js/TypeScript
  stack in CLAUDE.md.
- Brand colors / typography: *Not specified by you — proposed placeholder, swap freely.* Primary
  accent: a saturated blue (`#0B63CE`-range, evoking the trust/retail tone of established
  ecommerce marketplaces) for primary actions and links; a warm accent (e.g. orange/red,
  `#E8491D`-range) reserved specifically for discount/sale badges and urgency messaging, kept
  visually distinct from primary actions so it isn't overused. Neutral grays for backgrounds/
  borders/text. Typography: a single sans-serif variable font (e.g. Inter) for both UI chrome and
  body copy — no separate display font in v1.
- Light/dark mode: light mode is primary/required; dark mode supported via Tailwind's `dark:`
  variant as a nice-to-have, not a launch blocker.
- Responsive targets: mobile, tablet, and desktop are all must-support, mobile-first — ecommerce
  traffic skews majority mobile.
- Exact breakpoints and layout change at each:
  - `< 640px` (mobile): single-column product grid, category nav behind a hamburger, filters in a
    bottom sheet/drawer, sticky bottom cart/checkout CTA.
  - `640–1024px` (tablet): 2–3 column product grid, filters collapse into a toggleable sidebar.
  - `> 1024px` (desktop): full top nav with category mega-menu, filters sidebar always visible,
    4+ column product grid.
- Component structure convention: each component gets its own folder under
  `/components/<area>/<ComponentName>/` (component + co-located styles/tests), grouped by feature
  area (`product`, `cart`, `seller-dashboard`, `admin`, etc.), per CLAUDE.md > Architecture
  Principles.
- Browser/device support matrix: latest two versions of Chrome, Firefox, Safari, and Edge fully
  supported (desktop + mobile); no support for Internet Explorer or other legacy browsers.

## Information Architecture

- Top-level navigation: category mega-menu, global search bar, cart icon, account/orders menu in
  the primary storefront nav. A "Sell on [Platform]" entry point links out to seller
  onboarding/dashboard; it is not part of the main storefront mega-menu.
- Role-to-nav mapping: Buyers see the storefront nav plus an account area (orders, addresses,
  reviews). Sellers see the storefront nav (since a seller can also shop) *plus* a separate
  Seller Dashboard section (`(seller)` route group — products, orders, payouts, import history).
  Admins do not see the storefront nav at all when in the admin console — the `(admin)` route
  group is a distinct application shell (seller/category/order oversight, moderation, commission
  settings), not a set of items bolted onto the buyer nav.

## Key Flows

- **Onboarding**: registration → email verification → (optional) first-purchase or seller
  application.
- **Browse-to-checkout**: guest browsing → cart (session-based) → login/register prompt at
  checkout → address selection/entry → shipping method → Stripe payment → confirmation. Cart
  contents persist across the login/register step.
- **Seller onboarding/approval**: application form → pending state (with a "why is my
  application taking time" affordance) → Admin approval/rejection → store setup (logo, payout
  details) → first product submission → Admin content approval → live.
- **Bulk product import**: file upload → mode selection (add-only / full-replace / attribute-
  update, per functional.md) → validation preview → submit → progress/completion notification →
  per-row result review.
- **Order fulfillment**: seller sees new sub-order → confirms → ships with tracking → buyer
  tracks status per seller → delivery → review prompt.

## Accessibility

- Target conformance level: WCAG 2.1 AA, with particular attention to the checkout flow
  specifically (both a legal consideration in the EU and a conversion-rate consideration).
- Specifics: full keyboard navigation required through browse → cart → checkout; form errors
  announced to screen readers (not color-only); focus management on modal/drawer open-close.
- Minimum touch target size and spacing: 44×44px minimum, 8px minimum gap between adjacent
  interactive elements (touch is a primary input given the mobile-first target).

## Feedback & Error States

- Error message convention by category: network/connectivity failures → a toast with a retry
  action; field-level validation errors → inline messages directly under the field, not a
  generic banner; server errors (5xx) → a dedicated error state/banner with a generic message
  ("something went wrong, try again") — never raw error/stack detail (see security.md > Data
  Protection); authorization denials → an inline banner explaining access is restricted, not a
  silent redirect.
- Success/confirmation convention: minor actions (added to cart, saved address) → a toast;
  major actions (order placed, seller application submitted) → a dedicated confirmation page/
  redirect, not just a toast; form saves within a dashboard (seller editing a product) → an
  inline success banner near the form.
- Loading-state convention: skeleton loaders for page/data loads; buttons show an inline spinner
  and become disabled while their action is in flight (prevents double-submit, which also matters
  for the idempotency requirements in operations.md); long-running operations (bulk import,
  payout generation) show real progress (e.g. "342 / 1,000 rows processed") via polling or a
  background-job status endpoint, not just an indefinite spinner.
- Empty-state convention: every empty list/screen shows explanatory text plus a clear next
  action, not just "no results" — e.g. empty cart → "Your cart is empty" + browse CTA; buyer with
  no orders yet → "You haven't ordered anything yet" + browse CTA; seller with no products yet →
  "Add your first product" CTA.
- Client vs. server validation: both run off a single shared Zod schema per form (client via
  React Hook Form's resolver, server via the same schema in the Server Action/route handler) so
  the two can't drift apart — see CLAUDE.md > Security Baseline.
- Session-expiry behavior: if a session expires mid-form, the user sees a modal prompting
  re-authentication rather than a hard redirect that silently discards input; in-progress form
  values are held in local component state (and for longer forms like bulk-import mode selection,
  mirrored to `sessionStorage`) until the user re-authenticates and resubmits successfully.

## Localization & Formatting

- Languages: Romanian (primary) at launch, English planned as a likely second language — the app
  is built with an i18n library (e.g. `next-intl`) from day one specifically to avoid an expensive
  retrofit later, even though only Romanian ships initially.
- Date/number/currency formatting: locale-aware formatting via the `Intl` API driven by the
  active locale; currency displayed as RON (Romanian leu) with Romanian grouping/decimal
  conventions (comma as decimal separator) by default.
- Time zone handling for display: all timestamps are shown in a **fixed business zone,
  Europe/Bucharest**, for every user regardless of where they're browsing from — this is a
  single-market (Romania-focused) marketplace, so a fixed zone is simpler and less confusing than
  per-user time zone conversion. Storage remains UTC per data-model.md.
- RTL layout support: not needed (no RTL language planned).

## Per-Screen Specification Files

Not created yet — none of the screens have been designed in Plan Mode yet, so there's nothing
complex enough to warrant a dedicated `pages/<page-name>.md` file. Strong candidates once building
starts: the checkout flow (multi-step, multi-seller split) and the seller bulk-import screen
(three modes, validation preview, per-row results) — both are complex enough that Plan Mode alone
may miss something, per SPECS.md > Optional Extensions.
