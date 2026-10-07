import { expect, test } from "@playwright/test";
import { logIn, sessionFor } from "./helpers";

test.describe.configure({ mode: "serial" });

const QUESTION = "My parcel has not arrived yet";
const REPLY = "We are checking with the courier right now";

test.describe("support chat", () => {
  test("a visitor does not see the chat widget", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Open support chat/ })).toHaveCount(0);
  });

  test("FAQ topics answer instantly and are labelled as automated", async ({ page }) => {
    await logIn(page, "buyer");
    await page.goto("/");
    await page.getByRole("button", { name: /Open support chat/ }).click();

    const chat = page.getByRole("dialog", { name: "Support chat" });
    await chat.getByRole("button", { name: "How much is shipping?" }).click();

    await expect(chat.getByText("Automated answer")).toBeVisible();
    await expect(chat.getByText(/flat fee per seller/)).toBeVisible();
    await expect(chat.getByRole("link", { name: "Free-shipping subscription" })).toBeVisible();
    await expect(chat.getByRole("button", { name: "How much is shipping?" })).toHaveCount(0);
  });

  test("a conversation between a buyer and an admin works end to end", async ({ browser }) => {
    const buyer = await sessionFor(browser, "buyer");
    const admin = await sessionFor(browser, "admin");
    try {
      // Buyer writes to support.
      await buyer.page.goto("/");
      await buyer.page.getByRole("button", { name: /Open support chat/ }).click();
      const chat = buyer.page.getByRole("dialog", { name: "Support chat" });
      await chat.getByRole("button", { name: "Talk to a person" }).click();
      await chat.getByLabel("Message").fill(QUESTION);
      await chat.getByRole("button", { name: "Send" }).click();
      await expect(chat.getByText(QUESTION)).toBeVisible();
      // Once a real conversation exists, the FAQ chips go away.
      await expect(chat.getByRole("button", { name: "Talk to a person" })).toHaveCount(0);

      // Admin sees it in the inbox and answers.
      await admin.page.goto("/admin/support");
      await expect(admin.page.getByText("Ioana Buyer")).toBeVisible();
      await admin.page.getByText(QUESTION).click();
      await expect(admin.page.getByText(QUESTION)).toBeVisible();
      await admin.page.getByLabel("Reply").fill(REPLY);
      await admin.page.getByRole("button", { name: "Send reply" }).click();
      await expect(admin.page.getByText(REPLY)).toBeVisible();

      // The reply reaches the buyer's open chat without a page reload (polling).
      await expect(chat.getByText(REPLY)).toBeVisible({ timeout: 20_000 });

      // The admin closes the conversation; the buyer is told.
      await admin.page.getByRole("button", { name: "Close conversation" }).click();
      await expect(admin.page.getByText("This conversation is closed.")).toBeVisible();
      await expect(chat.getByText(/closed by support/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await buyer.context.close();
      await admin.context.close();
    }
  });

  test("a buyer cannot read the admin API", async ({ page }) => {
    await logIn(page, "buyer");
    const response = await page.request.get("/api/admin/support/anything");
    expect(response.status()).toBe(403);
  });
});
