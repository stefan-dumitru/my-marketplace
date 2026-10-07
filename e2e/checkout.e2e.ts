import { expect, test } from "@playwright/test";
import { PRODUCTS } from "./constants";
import { logIn } from "./helpers";

const INSTRUCTIONS = "Leave at the gate, ring the doorbell twice";

test.describe.configure({ mode: "serial" });

test.describe("cart and checkout", () => {
  test("a buyer can add an item to the cart and remove it again", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto(`/products/${PRODUCTS.mouse.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("button", { name: /Added/ })).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await expect(page.getByText(PRODUCTS.mouse.name)).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("checkout carries the address and delivery instructions through to the payment page", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto(`/products/${PRODUCTS.mouse.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("button", { name: /Added/ })).toBeVisible();

    await page.goto("/cart");
    await page.getByRole("link", { name: "Checkout" }).click();
    await expect(page.getByRole("heading", { name: "Shipping address" })).toBeVisible();

    await page.getByLabel("Recipient name").fill("Maria Popescu");
    await page.getByLabel("Street address").fill("Strada Exemplu 10");
    await page.getByLabel("City").fill("Cluj-Napoca");
    await page.getByLabel("County").fill("Cluj");
    await page.getByLabel("Postal code").fill("400001");
    await page.getByLabel("Phone").fill("0723456789");
    await page.getByLabel("Delivery instructions (optional)").fill(INSTRUCTIONS);
    await page.getByRole("button", { name: "Continue to payment" }).click();

    // The (fake) Stripe hosted page: proves the order was created and a payment session started.
    await page.waitForURL(/localhost:12111\/pay\/cs_e2e_/);
    await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();

    await page.goto("/orders");
    await expect(page.getByText("Awaiting payment")).toBeVisible();
    await page.locator('a[href^="/orders/"]').first().click();

    await expect(page.getByText("Maria Popescu")).toBeVisible();
    await expect(page.getByText("Delivery instructions:")).toBeVisible();
    await expect(page.getByText(INSTRUCTIONS)).toBeVisible();
    // 25.00 for the mouse + the flat per-seller shipping fee.
    await expect(page.getByText(/40[.,]00/).first()).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("checkout refuses an incomplete address and starts no payment", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto(`/products/${PRODUCTS.lamp.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("button", { name: /Added/ })).toBeVisible();

    await page.goto("/checkout");
    await page.getByLabel("Recipient name").fill("Maria Popescu");
    await page.getByRole("button", { name: "Continue to payment" }).click();

    await expect(page.getByText("Enter a street address.")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
  });

  test("delivery instructions longer than 255 characters are rejected", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto("/checkout");

    const box = page.getByLabel("Delivery instructions (optional)");
    // The field itself stops typing at 255, so assert the browser-enforced limit.
    await expect(box).toHaveAttribute("maxlength", "255");
  });
});
