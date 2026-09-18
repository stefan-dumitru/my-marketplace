"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { releasePayout } from "@/server/services/payout-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/payouts");
  if (session.user.role !== "admin") redirect("/");
}

export async function releasePayoutAction(sellerOrderId: string) {
  await requireAdmin();
  const result = await releasePayout(sellerOrderId);
  revalidatePath("/admin/payouts");
  return result;
}
