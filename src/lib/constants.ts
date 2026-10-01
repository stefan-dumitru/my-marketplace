// No low-stock concept exists anywhere else in the codebase — an invented, tunable v1 default.
// Shared between the seller dashboard stat (dashboard.ts), the alert-trigger check at checkout
// time (orders.ts), and the alert-reset check on restock (products.ts) so all three agree on the
// same threshold.
export const LOW_STOCK_THRESHOLD = 5;

// How many days after delivery the "leave a review" reminder fires — an invented, tunable v1
// default, long enough that a buyer has actually had a chance to use the product. Shared between
// the daily reminder job's day-bucket calculation (review-service.ts) and nothing else, but kept
// here rather than inline so it reads as a deliberate, named choice.
export const REVIEW_REMINDER_DELAY_DAYS = 5;

// Flat shipping fee per seller sub-order, in RON — an invented, tunable v1 placeholder. A 3-seller
// cart pays it three times. Changing it only affects future orders: each order freezes the fee it
// was placed with (SellerOrder.shippingFee / shippingCharged).
export const SHIPPING_FEE_PER_SELLER = 15;
