import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAddress, updateAddress, deleteAddress } from "@/server/services/address-service";
import { createBuyer } from "@test/helpers";

const ADDRESS_INPUT = {
  label: "Home",
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  phone: "0700000000",
  isDefault: false,
};

// Only ownership scoping is tested here — this app's createAddress/updateAddress just pass
// through whatever `isDefault` the caller sends (no "exactly one default address" invariant
// exists in the data layer), so the reference suite's auto-default-management scenarios don't
// apply and are deliberately skipped, per the "test only what exists" decision.
describe("updateAddress", () => {
  it("updates the owning buyer's own address", async () => {
    const buyer = await createBuyer();
    await createAddress(buyer.id, ADDRESS_INPUT);
    const address = await prisma.address.findFirstOrThrow({ where: { userId: buyer.id } });

    const result = await updateAddress(buyer.id, address.id, { ...ADDRESS_INPUT, city: "Cluj-Napoca" });

    expect(result.ok).toBe(true);
    const updated = await prisma.address.findUniqueOrThrow({ where: { id: address.id } });
    expect(updated.city).toBe("Cluj-Napoca");
  });

  it("rejects updating another user's address", async () => {
    const owner = await createBuyer();
    const intruder = await createBuyer();
    await createAddress(owner.id, ADDRESS_INPUT);
    const address = await prisma.address.findFirstOrThrow({ where: { userId: owner.id } });

    const result = await updateAddress(intruder.id, address.id, { ...ADDRESS_INPUT, city: "Hijacked" });

    expect(result.ok).toBe(false);
    const unchanged = await prisma.address.findUniqueOrThrow({ where: { id: address.id } });
    expect(unchanged.city).toBe("București");
  });
});

describe("deleteAddress", () => {
  it("deletes the owning buyer's own address", async () => {
    const buyer = await createBuyer();
    await createAddress(buyer.id, ADDRESS_INPUT);
    const address = await prisma.address.findFirstOrThrow({ where: { userId: buyer.id } });

    const result = await deleteAddress(buyer.id, address.id);

    expect(result.ok).toBe(true);
    const gone = await prisma.address.findUnique({ where: { id: address.id } });
    expect(gone).toBeNull();
  });

  it("rejects deleting another user's address", async () => {
    const owner = await createBuyer();
    const intruder = await createBuyer();
    await createAddress(owner.id, ADDRESS_INPUT);
    const address = await prisma.address.findFirstOrThrow({ where: { userId: owner.id } });

    const result = await deleteAddress(intruder.id, address.id);

    expect(result.ok).toBe(false);
    const stillThere = await prisma.address.findUnique({ where: { id: address.id } });
    expect(stillThere).not.toBeNull();
  });
});
