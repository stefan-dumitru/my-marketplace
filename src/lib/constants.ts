// No low-stock concept exists anywhere else in the codebase — an invented, tunable v1 default.
// Shared between the seller dashboard stat (dashboard.ts), the alert-trigger check at checkout
// time (orders.ts), and the alert-reset check on restock (products.ts) so all three agree on the
// same threshold.
export const LOW_STOCK_THRESHOLD = 5;
