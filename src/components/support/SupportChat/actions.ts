"use server";

import { auth } from "@/lib/auth";
import { sendUserSupportMessage, type SendResult } from "@/server/services/support-service";

export async function sendSupportMessageAction(body: string): Promise<SendResult> {
  const session = await auth();
  if (!session) return { ok: false, error: "Please log in to chat with support." };
  return sendUserSupportMessage(session.user.id, { body });
}
