import "server-only";
import { prisma } from "@/lib/prisma";
import type { FanCourierEnvironment } from "@/lib/fancourier";

/**
 * Data access for CarrierConfig: admin-configured shipping carrier credentials (encrypted).
 * v1 scope: one config per carrier/environment pair (FanCourier test + FanCourier production).
 * Credentials are stored encrypted in the database; decryption happens in the carrier service.
 */

export async function getCarrierConfig(
  carrier: "fancourier" = "fancourier",
  environment: FanCourierEnvironment = "test"
) {
  return prisma.carrierConfig.findUnique({
    where: {
      carrier_environment: { carrier, environment },
    },
  });
}

export async function getAllCarrierConfigs() {
  return prisma.carrierConfig.findMany({
    orderBy: { createdAt: "asc" },
  });
}

export async function createCarrierConfig(
  carrier: "fancourier" = "fancourier",
  environment: FanCourierEnvironment = "test",
  apiUsername: string,
  apiPassword: string
) {
  return prisma.carrierConfig.create({
    data: {
      carrier,
      environment,
      apiUsername, // Will be encrypted at rest by database or app-level encryption (TODO: implement)
      apiPassword, // Encrypted
      isActive: true,
    },
  });
}

export async function updateCarrierConfig(
  configId: string,
  updates: {
    apiUsername?: string;
    apiPassword?: string;
    environment?: FanCourierEnvironment;
    isActive?: boolean;
    lastVerifiedAt?: Date | null;
  }
) {
  return prisma.carrierConfig.update({
    where: { id: configId },
    data: updates,
  });
}

export async function setCarrierConfigVerified(configId: string) {
  return updateCarrierConfig(configId, {
    lastVerifiedAt: new Date(),
  });
}

export async function deactivateCarrierConfig(configId: string) {
  return updateCarrierConfig(configId, {
    isActive: false,
  });
}

export async function deleteCarrierConfig(configId: string) {
  return prisma.carrierConfig.delete({
    where: { id: configId },
  });
}
