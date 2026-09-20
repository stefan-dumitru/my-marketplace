import "server-only";
import { auth } from "@/lib/auth";
import { getSellerProfileByUserId } from "@/server/data/seller-profiles";

/**
 * Route Handler auth guards — `redirect()` is a page-navigation idiom and doesn't belong in an
 * API/download endpoint, so these return a Response directly instead. Every route below starts
 * with `const ctx = await requireX(); if (ctx instanceof Response) return ctx;`.
 */
export async function requireSellerForRoute(): Promise<{ sellerId: string } | Response> {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const profile = await getSellerProfileByUserId(session.user.id);
  if (!profile || profile.status !== "approved") {
    return new Response("Forbidden", { status: 403 });
  }
  return { sellerId: profile.id };
}

export async function requireAdminForRoute(): Promise<{ actorUserId: string } | Response> {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  return { actorUserId: session.user.id };
}
