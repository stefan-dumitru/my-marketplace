import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSellerContext } from "@/server/services/seller-service";

/**
 * Access checks for pages. Every protected page must call one of these itself: a layout's check is
 * NOT enough, because layouts are skipped on client-side navigation and the server can render a
 * page on its own (an RSC request that says the layout is already loaded), so a page that trusts
 * its layout can be fetched by anyone who crafts that request. See e2e/page-guards.e2e.ts.
 */
export async function requireAdminPage(callbackUrl = "/admin") {
  const session = await auth();
  if (!session) redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (session.user.role !== "admin") redirect("/");
  return session;
}

export async function requireApprovedSellerPage(callbackUrl = "/seller") {
  const context = await getSellerContext();
  if (!context) redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!context.profile || context.profile.status !== "approved") redirect("/sell");
  return { context, profile: context.profile };
}
