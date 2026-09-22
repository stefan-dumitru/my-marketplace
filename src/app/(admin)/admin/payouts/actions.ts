"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/payouts");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

export async function runPayoutBatchAction() {
  const actorUserId = await requireAdmin();
  await inngest.send({ name: "payouts/release.requested", data: { actorUserId } });
  revalidatePath("/admin/payouts");
  return { ok: true as const };
}
