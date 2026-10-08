import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { sessionFor } from "./helpers";

/**
 * Layouts are not re-run when the browser navigates client-side, and the server may render a page
 * on its own, without its layout. A page that relies on its layout to keep strangers out can
 * therefore be fetched directly by anyone who crafts that request.
 *
 * These tests record the exact request the app's own router makes while an authorised user
 * navigates, then replay it (re-pointed at every protected page) as someone who must not get the
 * page. Each page first gets a CONTROL: the replay with the right login must return the page, and
 * the page's own <h1> is read from that response. That heading is then the marker: it must be
 * absent for anonymous visitors and for logged-in users with the wrong role.
 */

type Captured = { url: string; headers: Record<string, string> };
type RequestFactory = {
  request: { newContext(options?: { baseURL?: string; extraHTTPHeaders?: Record<string, string> }): Promise<APIRequestContext> };
};

const ADMIN_PAGES = [
  "/admin/audit-log",
  "/admin/carrier-settings",
  "/admin/categories",
  "/admin/categories/new",
  "/admin/coupons",
  "/admin/coupons/new",
  "/admin/payouts",
  "/admin/products",
  "/admin/reports",
  "/admin/reviews",
  "/admin/sellers",
  "/admin/support",
];

const SELLER_PAGES = [
  "/seller",
  "/seller/orders",
  "/seller/payouts",
  "/seller/reports",
  "/seller/products/new",
  "/seller/products/import",
];

async function captureRouterRequest(page: Page, fromPath: string, linkName: RegExp, toPath: string): Promise<Captured> {
  await page.goto(fromPath);
  let captured: Captured | undefined;
  page.on("request", (req) => {
    const headers = req.headers();
    // The router fires several requests per navigation; the real one is the non-prefetch fetch.
    if (new URL(req.url()).pathname === toPath && headers["rsc"] === "1" && !headers["next-router-prefetch"]) {
      captured = { url: req.url(), headers };
    }
  });
  await page.getByRole("link", { name: linkName }).first().click();
  await expect.poll(() => captured, { timeout: 15_000 }).toBeTruthy();
  const c = captured!;
  // Only the headers that steer how Next renders; the URL keeps its generated `_rsc` hash.
  const keep = ["rsc", "next-router-state-tree", "next-url"];
  return { url: c.url, headers: Object.fromEntries(Object.entries(c.headers).filter(([k]) => keep.includes(k))) };
}

async function cookieHeaderFor(browser: Browser, who: "buyer" | "seller" | "admin") {
  const session = await sessionFor(browser, who);
  const header = (await session.context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await session.context.close();
  return header;
}

/** Replays the captured router request against another page, with the given login (or none). */
async function replay(playwright: RequestFactory, baseURL: string | undefined, captured: Captured, path: string, cookie?: string) {
  const url = new URL(captured.url);
  const target = `${path}${url.search}`;
  const context = await playwright.request.newContext({ baseURL, extraHTTPHeaders: cookie ? { cookie } : undefined });
  try {
    const response = await context.get(target, { headers: captured.headers, maxRedirects: 0 });
    return await response.text();
  } finally {
    await context.dispose();
  }
}

/** The page's own heading, as it appears in the flight data: "h1",null,{...,"children":"Title"} */
function headingOf(body: string): string | undefined {
  return /"h1",null,\{[^}]*"children":"([^"]+)"/.exec(body)?.[1];
}

async function assertGuarded(opts: {
  playwright: RequestFactory;
  baseURL: string | undefined;
  captured: Captured;
  paths: string[];
  authorisedCookie: string;
  strangers: Record<string, string | undefined>;
}) {
  for (const path of opts.paths) {
    const control = await replay(opts.playwright, opts.baseURL, opts.captured, path, opts.authorisedCookie);
    const heading = headingOf(control);
    expect(heading, `control for ${path} should return a page with a heading`).toBeTruthy();
    const marker = `"children":"${heading}"`;

    for (const [who, cookie] of Object.entries(opts.strangers)) {
      const body = await replay(opts.playwright, opts.baseURL, opts.captured, path, cookie);
      expect(body, `${path} must not render for ${who}`).not.toContain(marker);
    }
  }
}

test.describe("pages do not rely on their layout for access control", () => {
  // Each test makes dozens of requests (3 logins, then 3 replays per page); allow for a slow machine.
  test.setTimeout(150_000);

  test("every admin page is withheld from anonymous visitors and non-admins", async ({ browser, playwright, baseURL }) => {
    const admin = await sessionFor(browser, "admin");
    const captured = await captureRouterRequest(admin.page, "/admin", /^Support/, "/admin/support");
    const adminCookie = (await admin.context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    await admin.context.close();
    const buyerCookie = await cookieHeaderFor(browser, "buyer");
    const sellerCookie = await cookieHeaderFor(browser, "seller");

    const strangers = { "an anonymous visitor": undefined, "a buyer": buyerCookie, "a seller": sellerCookie };
    await assertGuarded({ playwright, baseURL, captured, paths: ADMIN_PAGES, authorisedCookie: adminCookie, strangers });

    // The dashboard needs its own capture: replaying a request made from /admin back to /admin
    // asks Next for no change at all, so it has to be recorded while standing on another page.
    const admin2 = await sessionFor(browser, "admin");
    const toDashboard = await captureRouterRequest(admin2.page, "/admin/support", /^Dashboard/, "/admin");
    await admin2.context.close();
    await assertGuarded({ playwright, baseURL, captured: toDashboard, paths: ["/admin"], authorisedCookie: adminCookie, strangers });
  });

  test("every seller page is withheld from anonymous visitors and non-sellers", async ({ browser, playwright, baseURL }) => {
    const seller = await sessionFor(browser, "seller");
    const captured = await captureRouterRequest(seller.page, "/seller", /Orders/, "/seller/orders");
    const sellerCookie = (await seller.context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    await seller.context.close();
    const buyerCookie = await cookieHeaderFor(browser, "buyer");
    const adminCookie = await cookieHeaderFor(browser, "admin");

    await assertGuarded({
      playwright,
      baseURL,
      captured,
      paths: SELLER_PAGES,
      authorisedCookie: sellerCookie,
      strangers: { "an anonymous visitor": undefined, "a buyer": buyerCookie, "an admin without a seller profile": adminCookie },
    });
  });
});
