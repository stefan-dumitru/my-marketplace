import "server-only";
import { prisma } from "@/lib/prisma";

type AddressData = {
  label?: string | null;
  recipientName: string;
  line1: string;
  line2?: string | null;
  city: string;
  county: string;
  postalCode: string;
  phone: string;
  isDefault: boolean;
};

export function listAddressesForUser(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export function getAddressForUser(userId: string, addressId: string) {
  return prisma.address.findFirst({ where: { id: addressId, userId } });
}

/**
 * Setting a new default must unset every other address for this user in the same transaction —
 * the "exactly one default per user" invariant is application-level (no partial unique index),
 * so it's only ever true if every write path that sets isDefault:true goes through here.
 */
export function createAddressForUser(userId: string, data: AddressData) {
  if (!data.isDefault) {
    return prisma.address.create({ data: { ...data, userId } });
  }

  return prisma.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, userId } });
  });
}

/** Verify-then-update: same ownership-scoped pattern as updateCategory/updateProductForSeller. */
export async function updateAddressForUser(userId: string, addressId: string, data: AddressData) {
  const owned = await prisma.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
  if (!owned) return null;

  if (!data.isDefault) {
    return prisma.address.update({ where: { id: addressId }, data });
  }

  return prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true, id: { not: addressId } },
      data: { isDefault: false },
    });
    return tx.address.update({ where: { id: addressId }, data });
  });
}

export async function deleteAddressForUser(userId: string, addressId: string) {
  const owned = await prisma.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
  if (!owned) return null;

  return prisma.address.delete({ where: { id: addressId } });
}
