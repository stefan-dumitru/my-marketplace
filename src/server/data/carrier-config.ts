import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { FanCourierEnvironment } from "@/lib/fancourier";

/**
 * Data access for CarrierConfig: admin-configured shipping carrier credentials.
 * v1 scope: one config per carrier/environment pair (FanCourier test + FanCourier production).
 * apiUsername and apiPassword are AES-256-GCM encrypted at rest (lib/crypto.ts); only
 * getCarrierConfig decrypts, and only server-side callers that need to call the carrier use it.
 */

export async function getCarrierConfig(
  carrier: "fancourier" = "fancourier",
  environment: FanCourierEnvironment = "test"
) {
  const row = await prisma.carrierConfig.findUnique({
    where: { carrier_environment: { carrier, environment } },
  });
  if (!row) return null;
  return { ...row, apiUsername: decryptSecret(row.apiUsername), apiPassword: decryptSecret(row.apiPassword) };
}

/**
 * The config used for live calls. FAN Courier has no sandbox host, so "test" vs "production" only
 * selects which credentials are used; set CARRIER_ENVIRONMENT=production to ship with the live
 * account. Defaults to "test" so nothing real is created by accident.
 */
export function getActiveCarrierConfig() {
  const env = process.env.CARRIER_ENVIRONMENT === "production" ? "production" : "test";
  return getCarrierConfig("fancourier", env);
}

/** Admin-listing view: never includes the password; username is decrypted for display. */
export async function getAllCarrierConfigs() {
  const rows = await prisma.carrierConfig.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    carrier: r.carrier,
    environment: r.environment,
    apiUsername: decryptSecret(r.apiUsername),
    clientId: r.clientId,
    isActive: r.isActive,
    lastVerifiedAt: r.lastVerifiedAt,
  }));
}

export async function upsertCarrierConfig(
  carrier: "fancourier",
  environment: FanCourierEnvironment,
  apiUsername: string,
  apiPassword: string,
  clientId: string
) {
  const data = {
    clientId,
    apiUsername: encryptSecret(apiUsername),
    apiPassword: encryptSecret(apiPassword),
    isActive: true,
    lastVerifiedAt: new Date(),
  };
  return prisma.carrierConfig.upsert({
    where: { carrier_environment: { carrier, environment } },
    create: { carrier, environment, ...data },
    update: data,
  });
}

export async function deactivateCarrierConfig(configId: string) {
  return prisma.carrierConfig.update({ where: { id: configId }, data: { isActive: false } });
}
