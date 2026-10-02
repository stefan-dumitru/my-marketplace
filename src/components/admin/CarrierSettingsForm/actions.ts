"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCarrierConfig, updateCarrierConfig } from "@/server/data/carrier-config";
import { createFanCourierClient } from "@/lib/fancourier";
import { setCarrierConfigVerified } from "@/server/data/carrier-config";

export type UpdateCarrierSettingsInput = {
  carrier: "fancourier";
  environment: "test" | "production";
  apiUsername: string;
  apiPassword: string;
  configId?: string;
};

export type UpdateCarrierSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCarrierSettingsAction(
  input: UpdateCarrierSettingsInput
): Promise<UpdateCarrierSettingsResult> {
  // Independently re-verified — this Action is its own entry point
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    redirect("/auth/login?callbackUrl=/admin/carrier-settings");
  }

  try {
    // Verify credentials before saving
    const client = createFanCourierClient(
      input.apiUsername,
      input.apiPassword,
      input.environment
    );
    const verified = await client.verifyCredentials();
    if (!verified) {
      return {
        ok: false,
        error: "Failed to verify FanCourier credentials. Check your username and password.",
      };
    }

    // Create or update the config
    if (input.configId) {
      await updateCarrierConfig(input.configId, {
        apiUsername: input.apiUsername,
        apiPassword: input.apiPassword,
      });
    } else {
      await createCarrierConfig(
        input.carrier,
        input.environment,
        input.apiUsername,
        input.apiPassword
      );
    }

    // Mark as verified after successful save
    if (input.configId) {
      await setCarrierConfigVerified(input.configId);
    }

    return { ok: true };
  } catch (err) {
    console.error("Failed to update carrier settings:", err);
    return {
      ok: false,
      error: "Failed to save settings. Please try again.",
    };
  }
}
