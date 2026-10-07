import { expect, test } from "@playwright/test";
import { PRODUCTS } from "./constants";

test.describe("storefront", () => {
  test("lists the catalog and narrows it with search", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByText(PRODUCTS.mouse.name).first()).toBeVisible();
    await expect(page.getByText(PRODUCTS.lamp.name).first()).toBeVisible();

    await page.goto("/products?q=mouse");
    await expect(page.getByText(PRODUCTS.mouse.name).first()).toBeVisible();
    await expect(page.getByText(PRODUCTS.lamp.name)).toHaveCount(0);
  });

  test("a product page shows its details and technical specifications", async ({ page }) => {
    await page.goto(`/products/${PRODUCTS.mouse.slug}`);

    await expect(page.getByRole("heading", { level: 1, name: PRODUCTS.mouse.name })).toBeVisible();
    await expect(page.getByText("Sold by E2E Gadgets")).toBeVisible();
    await expect(page.getByText(/25[.,]00/).first()).toBeVisible();

    const specs = page.getByRole("heading", { name: "Technical specifications" });
    await expect(specs).toBeVisible();
    for (const { label, value } of PRODUCTS.mouse.specs) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    }
  });

  test("a product without specifications has no empty specifications section", async ({ page }) => {
    await page.goto(`/products/${PRODUCTS.lamp.slug}`);

    await expect(page.getByRole("heading", { level: 1, name: PRODUCTS.lamp.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical specifications" })).toHaveCount(0);
  });

  test("a visitor is asked to log in before buying", async ({ page }) => {
    await page.goto(`/products/${PRODUCTS.mouse.slug}`);
    await page.getByRole("link", { name: "Log in to buy" }).click();
    await expect(page).toHaveURL(/\/auth\/login\?callbackUrl=/);
  });

  test("an unknown product is a 404", async ({ page }) => {
    const response = await page.goto("/products/this-product-does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
