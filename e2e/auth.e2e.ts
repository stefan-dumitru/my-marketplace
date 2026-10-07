import { expect, test } from "@playwright/test";
import { PASSWORD, USERS } from "./constants";
import { logIn } from "./helpers";

test.describe("authentication and access control", () => {
  test("a buyer logs in and lands on their account", async ({ page }) => {
    await logIn(page, "buyer");
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: /Welcome back, Ioana Buyer/ })).toBeVisible();
  });

  test("signing in repeatedly never trips the CAPTCHA or lockout", async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await logIn(page, "buyer");
      await expect(page).toHaveURL(/\/account/);
      await page.context().clearCookies();
    }
  });

  test("a wrong password is rejected with a generic message", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(USERS.buyer.email);
    await page.getByLabel("Password").fill(`${PASSWORD}-wrong`);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("a logged-in user returns to the page they came from", async ({ page }) => {
    await logIn(page, "buyer", "/orders");
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  });

  test("protected areas send anonymous visitors to the login page", async ({ page }) => {
    for (const path of ["/admin", "/seller", "/checkout", "/orders"]) {
      await page.goto(path);
      await expect(page, `${path} should require login`).toHaveURL(/\/auth\/login/);
    }
  });

  test("a buyer cannot open the admin or seller areas", async ({ page }) => {
    await logIn(page, "buyer");

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);

    await page.goto("/seller");
    await expect(page).not.toHaveURL(/\/seller(\/|$)/);
  });

  test("an admin can open the admin area and a seller can open the seller dashboard", async ({ page }) => {
    await logIn(page, "admin", "/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("link", { name: /Support/ })).toBeVisible();

    await page.context().clearCookies();
    await logIn(page, "seller", "/seller");
    await expect(page.getByRole("heading", { name: "E2E Gadgets" })).toBeVisible();
  });
});
