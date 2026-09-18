"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { releasePayout } from "@/server/services/payout-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/payouts");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

export async function releasePayoutAction(sellerOrderId: string) {
  const actorUserId = await requireAdmin();
  const result = await releasePayout(sellerOrderId, actorUserId);
  revalidatePath("/admin/payouts");
  return result;
}
