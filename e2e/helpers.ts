import fs from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";
import { PASSWORD, SEED_FILE, USERS, type SeedInfo } from "./constants";

export function seedInfo(): SeedInfo {
  return JSON.parse(fs.readFileSync(SEED_FILE, "utf8")) as SeedInfo;
}

export async function logIn(page: Page, who: keyof typeof USERS, callbackUrl?: string) {
  const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
  await page.goto(`/auth/login${query}`);
  await page.getByLabel("Email").fill(USERS[who].email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

/** A fresh, isolated browser session already logged in as the given user. */
export async function sessionFor(browser: Browser, who: keyof typeof USERS) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logIn(page, who);
  return { context, page };
}
