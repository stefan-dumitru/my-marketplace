import { z } from "zod";

export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;

export const supportMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a message first.")
    .max(SUPPORT_MESSAGE_MAX_LENGTH, `Messages can be at most ${SUPPORT_MESSAGE_MAX_LENGTH} characters.`),
});

export type SupportMessageInput = z.infer<typeof supportMessageSchema>;
