"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getCarrierConfig, upsertCarrierConfig } from "@/server/data/carrier-config";
import { createFanCourierClient } from "@/lib/fancourier";
import { logger } from "@/lib/logger";

const inputSchema = z.object({
  carrier: z.literal("fancourier"),
  environment: z.enum(["test", "production"]),
  apiUsername: z.string().min(1).max(200),
  clientId: z.string().regex(/^\d{1,12}$/, "Client ID must be numeric"),
  // Blank means "keep the stored password" — only allowed when a config already exists.
  apiPassword: z.string().max(200),
});

export type UpdateCarrierSettingsInput = z.infer<typeof inputSchema>;

export type UpdateCarrierSettingsResult = { ok: true } | { ok: false; error: string };

export async function updateCarrierSettingsAction(
  input: UpdateCarrierSettingsInput
): Promise<UpdateCarrierSettingsResult> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login?callbackUrl=/admin/carrier-settings");
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { carrier, environment, apiUsername, clientId } = parsed.data;

  try {
    let apiPassword = parsed.data.apiPassword;
    if (!apiPassword) {
      const existing = await getCarrierConfig(carrier, environment);
      if (!existing) return { ok: false, error: "API password is required." };
      apiPassword = existing.apiPassword;
    }

    const client = createFanCourierClient(apiUsername, apiPassword, clientId);
    if (!(await client.verifyCredentials())) {
      return { ok: false, error: "Could not log in to FAN Courier. Check the username and password." };
    }

    await upsertCarrierConfig(carrier, environment, apiUsername, apiPassword, clientId);
    revalidatePath("/admin/carrier-settings");
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Failed to update carrier settings");
    return { ok: false, error: "Failed to save settings. Please try again." };
  }
}
