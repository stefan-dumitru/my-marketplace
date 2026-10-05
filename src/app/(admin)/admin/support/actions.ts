"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  closeSupportConversation,
  sendAdminSupportReply,
  type SendResult,
} from "@/server/services/support-service";

async function requireAdminId() {
  const session = await auth();
  return session && session.user.role === "admin" ? session.user.id : null;
}

export async function sendAdminReplyAction(conversationId: string, body: string): Promise<SendResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "Not authorized." };
  return sendAdminSupportReply(adminId, conversationId, { body });
}

export async function closeConversationAction(conversationId: string): Promise<{ ok: boolean }> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false };
  const result = await closeSupportConversation(adminId, conversationId);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${conversationId}`);
  return { ok: result.ok };
}
