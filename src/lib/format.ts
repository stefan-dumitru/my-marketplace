// RON per ui-guidelines.md > Localization & Formatting — Romanian locale/currency conventions.
const currencyFormatter = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" });

// Accepts Prisma's Decimal (decimal.js) instances too, not just number/string — Number()
// coerces them correctly via their valueOf().
export function formatPrice(value: unknown): string {
  return currencyFormatter.format(Number(value));
}
