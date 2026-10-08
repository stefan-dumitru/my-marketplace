import { expect, test } from "@playwright/test";
import { logIn, seedInfo } from "./helpers";

test.describe("a seller ships only with the label's tracking number", () => {
  test("the order page offers the label first and does not let the seller type a tracking number", async ({ page }) => {
    await logIn(page, "seller");
    await page.goto(`/seller/orders/${seedInfo().confirmedSellerOrderId}`);

    await expect(page.getByRole("heading", { name: "ORD-E2E-0001" })).toBeVisible();
    await expect(page.getByText("1. Generate FanCourier label")).toBeVisible();
    await expect(page.getByText("2. Mark as shipped")).toBeVisible();

    // Nothing to type a number into, and nothing to click until a label exists.
    await expect(page.getByLabel("Tracking number")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeDisabled();
    await expect(page.getByText(/Generate the FAN Courier label below first/)).toBeVisible();
  });

  test("the buyer's delivery details are shown to the seller for the label", async ({ page }) => {
    await logIn(page, "seller");
    await page.goto(`/seller/orders/${seedInfo().confirmedSellerOrderId}`);

    await expect(page.getByText("Maria Popescu").first()).toBeVisible();
    await expect(page.getByLabel("City")).toHaveValue("Cluj-Napoca");
  });

  test("a buyer cannot open the seller's order page", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto(`/seller/orders/${seedInfo().confirmedSellerOrderId}`);
    await expect(page).not.toHaveURL(/\/seller\/orders/);
  });
});
