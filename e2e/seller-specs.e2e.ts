import { expect, test } from "@playwright/test";
import { PRODUCTS } from "./constants";
import { logIn, seedInfo } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("seller edits product specifications", () => {
  test("a seller adds a specification and shoppers see it", async ({ page }) => {
    await logIn(page, "seller");
    await page.goto(`/seller/products/${seedInfo().keyboardId}/edit`);

    // Existing specifications are loaded into the form.
    await expect(page.getByLabel("Specification 1 name")).toHaveValue(PRODUCTS.keyboard.specs[0].label);
    await expect(page.getByLabel("Specification 1 value")).toHaveValue(PRODUCTS.keyboard.specs[0].value);

    await page.getByRole("button", { name: "Add specification" }).click();
    await page.getByLabel("Specification 3 name").fill("Warranty");
    await page.getByLabel("Specification 3 value").fill("24 months");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/seller$/);

    await page.goto(`/products/${PRODUCTS.keyboard.slug}`);
    await expect(page.getByText("Warranty", { exact: true })).toBeVisible();
    await expect(page.getByText("24 months", { exact: true })).toBeVisible();
  });

  test("a half-filled specification row is refused before saving", async ({ page }) => {
    await logIn(page, "seller");
    await page.goto(`/seller/products/${seedInfo().keyboardId}/edit`);

    await page.getByRole("button", { name: "Add specification" }).click();
    await page.getByLabel("Specification 4 name").fill("Colour");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Each specification needs both a name and a value.")).toBeVisible();
    await expect(page).toHaveURL(/\/edit/);
  });

  test("removing every row clears the specifications table from the product page", async ({ page }) => {
    await logIn(page, "seller");
    await page.goto(`/seller/products/${seedInfo().keyboardId}/edit`);

    // Three saved rows (two seeded + Warranty): remove them all.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Remove" }).first().click();
    }
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/seller$/);

    await page.goto(`/products/${PRODUCTS.keyboard.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: PRODUCTS.keyboard.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical specifications" })).toHaveCount(0);
  });

  test("another seller's product page is not editable by a buyer", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto(`/seller/products/${seedInfo().keyboardId}/edit`);
    await expect(page).not.toHaveURL(/\/seller\/products/);
  });
});
