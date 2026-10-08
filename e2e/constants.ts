export const PASSWORD = "E2e-Passw0rd!";

export const USERS = {
  buyer: { email: "buyer@e2e.test", name: "Ioana Buyer" },
  seller: { email: "seller@e2e.test", name: "Sorin Seller" },
  admin: { email: "admin@e2e.test", name: "Ana Admin" },
} as const;

export const PRODUCTS = {
  mouse: {
    name: "E2E Wireless Mouse",
    slug: "e2e-wireless-mouse",
    sku: "E2E-MOUSE",
    price: 25,
    stock: 20,
    specs: [
      { label: "Battery", value: "2 x AA" },
      { label: "Weight", value: "95 g" },
    ],
  },
  // Owned by the seller-editing tests, so they never disturb the products other tests read.
  keyboard: {
    name: "E2E Mechanical Keyboard",
    slug: "e2e-mechanical-keyboard",
    sku: "E2E-KEYBOARD",
    price: 120,
    stock: 8,
    specs: [
      { label: "Layout", value: "Tenkeyless" },
      { label: "Switches", value: "Brown" },
    ],
  },
  lamp: { name: "E2E Desk Lamp", slug: "e2e-desk-lamp", sku: "E2E-LAMP", price: 80, stock: 10 },
} as const;

export const SEED_FILE = "e2e/.seed.json";

export type SeedInfo = { mouseId: string; lampId: string; keyboardId: string; confirmedSellerOrderId: string };
