import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/seller/orders/[id]/label/route";
import { prisma } from "@/lib/prisma";
import { clearFanCourierTokenCache } from "@/lib/fancourier";
import { upsertCarrierConfig } from "@/server/data/carrier-config";
import {
  createActiveProduct,
  createApprovedSeller,
  createBuyer,
  createCategory,
  placeOrder,
  sessionFor,
} from "@test/helpers";

const authMock = auth as unknown as Mock;
const call = (id: string) =>
  GET(new Request(`http://localhost/api/seller/orders/${id}/label`), { params: Promise.resolve({ id }) });

// The bytes of "%PDF-1.4".
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function mockFanCourier(labelStatus = 200) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/login")) {
      return Response.json({ status: "success", data: { token: "tok", expiresAt: "2099-01-01 00:00:00" } });
    }
    if (url.includes("/awb/label")) {
      return labelStatus === 200
        ? new Response(PDF_BYTES, { headers: { "Content-Type": "application/pdf" } })
        : new Response("boom", { status: labelStatus });
    }
    return new Response("unexpected " + url, { status: 500 });
  });
}

async function confirmedOrderWithLabel() {
  const seller = await createApprovedSeller();
  const buyer = await createBuyer();
  const category = await createCategory();
  const product = await createActiveProduct(seller.profile.id, category.id);
  const order = await placeOrder(buyer.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id } });
  await prisma.sellerOrder.update({
    where: { id: sellerOrder.id },
    data: { status: "confirmed", trackingNumber: "2228300120233", labelUrl: `/api/seller/orders/${sellerOrder.id}/label` },
  });
  return { seller, sellerOrder };
}

describe("GET /api/seller/orders/[id]/label", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
    delete process.env.CARRIER_ENVIRONMENT;
    await upsertCarrierConfig("fancourier", "test", "user", "pw", "7032158");
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects anonymous visitors", async () => {
    const { sellerOrder } = await confirmedOrderWithLabel();
    authMock.mockResolvedValue(null);
    expect((await call(sellerOrder.id)).status).toBe(401);
  });

  it("rejects a logged-in user who is not an approved seller", async () => {
    const { sellerOrder } = await confirmedOrderWithLabel();
    const buyer = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: buyer.id, role: "buyer" }));
    expect((await call(sellerOrder.id)).status).toBe(403);
  });

  it("returns 404 to a different seller, without calling FAN Courier", async () => {
    const { sellerOrder } = await confirmedOrderWithLabel();
    const intruder = await createApprovedSeller();
    authMock.mockResolvedValue(sessionFor({ id: intruder.user.id, role: "seller" }));
    const fetchSpy = mockFanCourier();

    expect((await call(sellerOrder.id)).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 404 when no label has been generated yet", async () => {
    const { seller, sellerOrder } = await confirmedOrderWithLabel();
    await prisma.sellerOrder.update({ where: { id: sellerOrder.id }, data: { trackingNumber: null, labelUrl: null } });
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));

    expect((await call(sellerOrder.id)).status).toBe(404);
  });

  it("streams the PDF to the owning seller without caching it", async () => {
    const { seller, sellerOrder } = await confirmedOrderWithLabel();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    mockFanCourier();

    const res = await call(sellerOrder.id);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("content-disposition")).toContain("label-2228300120233.pdf");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("answers 502 when FAN Courier cannot return the label", async () => {
    const { seller, sellerOrder } = await confirmedOrderWithLabel();
    authMock.mockResolvedValue(sessionFor({ id: seller.user.id, role: "seller" }));
    mockFanCourier(500);

    expect((await call(sellerOrder.id)).status).toBe(502);
  });
});
