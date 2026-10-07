import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearFanCourierTokenCache } from "@/lib/fancourier";
import { upsertCarrierConfig } from "@/server/data/carrier-config";
import { generateLabelAction } from "@/components/seller/GenerateShippingLabel/actions";
import {
  createActiveProduct,
  createApprovedSeller,
  createBuyer,
  createCategory,
  placeOrder,
  sessionFor,
} from "@test/helpers";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const authMock = auth as unknown as Mock;

function mockFanCourier() {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/login")) {
      return Response.json({ status: "success", data: { token: "tok", expiresAt: "2099-01-01 00:00:00" } });
    }
    if (url.includes("/reports/counties")) return Response.json({ status: "success", data: [{ name: "Cluj" }] });
    if (url.includes("/reports/localities")) return Response.json({ status: "success", data: [{ name: "Cluj-Napoca" }] });
    if (url.includes("/intern-awb")) return Response.json({ response: [{ awbNumber: 2228300120233, errors: null }] });
    return new Response("unexpected " + url, { status: 500 });
  });
}

function labelInput(sellerOrderId: string, overrides: Record<string, unknown> = {}) {
  return {
    sellerOrderId,
    recipientName: "Test Recipient",
    recipientPhone: "0723456789",
    recipientAddress: "Strada Exemplu 10",
    recipientCity: "Cluj-Napoca",
    recipientCounty: "Cluj",
    recipientPostalCode: "400001",
    pieces: 1,
    weight: 0.5,
    ...overrides,
  };
}

async function confirmedSellerOrder() {
  const seller = await createApprovedSeller();
  const buyer = await createBuyer();
  const category = await createCategory();
  const product = await createActiveProduct(seller.profile.id, category.id);
  const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id } });
  await prisma.sellerOrder.update({ where: { id: sellerOrder.id }, data: { status: "confirmed" } });
  return { seller, sellerOrder };
}

describe("generateLabelAction", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
    delete process.env.CARRIER_ENVIRONMENT;
    await upsertCarrierConfig("fancourier", "test", "user", "pw", "7032158");
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends anonymous visitors and non-sellers to login without calling FAN Courier", async () => {
    const { sellerOrder } = await confirmedSellerOrder();
    const fetchSpy = mockFanCourier();

    authMock.mockResolvedValue(null);
    await expect(generateLabelAction(labelInput(sellerOrder.id))).rejects.toThrow(/NEXT_REDIRECT/);

    const buyer = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: buyer.id, role: "buyer" }));
    await expect(generateLabelAction(labelInput(sellerOrder.id))).rejects.toThrow(/NEXT_REDIRECT/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a seller user who has no seller profile", async () => {
    const { sellerOrder } = await confirmedSellerOrder();
    const bare = await prisma.user.create({
      data: { email: "bare-seller@example.com", passwordHash: "x", name: "Bare", role: "seller" },
    });
    authMock.mockResolvedValue(sessionFor({ id: bare.id, role: "seller" }));
    mockFanCourier();

    const result = await generateLabelAction(labelInput(sellerOrder.id));

    expect(result).toEqual({ ok: false, error: "Seller profile not found." });
  });

  it("refuses a seller who does not own the order, and creates no shipment", async () => {
    const { sellerOrder } = await confirmedSellerOrder();
    const intruder = await createApprovedSeller();
    authMock.mockResolvedValue(sessionFor({ id: intruder.user.id, role: "seller" }));
    const fetchSpy = mockFanCourier();

    const result = await generateLabelAction(labelInput(sellerOrder.id));

    expect(result).toEqual({ ok: false, error: "You do not have access to this order." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } })).trackingNumber).toBeNull();
  });

  it("returns an error for an incomplete form without calling FAN Courier", async () => {
    const { seller, sellerOrder } = await confirmedSellerOrder();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    const fetchSpy = mockFanCourier();

    const result = await generateLabelAction(labelInput(sellerOrder.id, { recipientName: "" }));

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects delivery instructions longer than FAN Courier allows", async () => {
    const { seller, sellerOrder } = await confirmedSellerOrder();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    mockFanCourier();

    const result = await generateLabelAction(labelInput(sellerOrder.id, { instructions: "x".repeat(256) }));

    expect(result.ok).toBe(false);
  });

  it("generates the label for the owning seller and stores the tracking number", async () => {
    const { seller, sellerOrder } = await confirmedSellerOrder();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    mockFanCourier();

    const result = await generateLabelAction(labelInput(sellerOrder.id, { instructions: "Leave at the gate" }));

    expect(result).toEqual({
      ok: true,
      trackingNumber: "2228300120233",
      labelUrl: `/api/seller/orders/${sellerOrder.id}/label`,
    });
    const stored = await prisma.sellerOrder.findUniqueOrThrow({ where: { id: sellerOrder.id } });
    expect(stored.trackingNumber).toBe("2228300120233");
    expect(stored.labelUrl).toBe(`/api/seller/orders/${sellerOrder.id}/label`);
  });

  it("will not generate a second label for the same order", async () => {
    const { seller, sellerOrder } = await confirmedSellerOrder();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    mockFanCourier();
    await generateLabelAction(labelInput(sellerOrder.id));

    const second = await generateLabelAction(labelInput(sellerOrder.id));

    expect(second.ok).toBe(false);
  });
});
