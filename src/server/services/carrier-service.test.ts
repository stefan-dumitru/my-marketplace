import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import * as carrierService from "@/server/services/carrier-service";
import * as carrierConfig from "@/server/data/carrier-config";
import { clearFanCourierTokenCache } from "@/lib/fancourier";
import { createApprovedSeller, createBuyer, createActiveProduct, createCategory } from "@test/helpers";

const ADDRESS = {
  recipientName: "Test Buyer",
  line1: "Str. Exemplu 1",
  line2: "",
  city: "București",
  county: "București",
  postalCode: "010101",
  phone: "0700000000",
};

async function createOrder(buyerId: string, sellerId: string, variantId: string) {
  const order = await prisma.order.create({
    data: {
      buyerId,
      orderNumber: "ORD-TEST-" + Math.random().toString(36).slice(2),
      status: "paid",
      totalAmount: 100,
      currency: "RON",
      shippingAddressSnapshot: ADDRESS,
      payment: { create: { amount: 100, currency: "RON", status: "succeeded" } },
      sellerOrders: {
        create: [
          {
            sellerId,
            status: "confirmed",
            subtotal: 100,
            commissionAmount: 10,
            payoutAmount: 90,
            items: {
              create: [
                {
                  productVariantId: variantId,
                  productNameSnapshot: "Test Product",
                  unitPriceSnapshot: 100,
                  quantity: 1,
                  lineTotal: 100,
                },
              ],
            },
          },
        ],
      },
    },
    include: { sellerOrders: true },
  });
  return order.sellerOrders[0];
}

describe("Carrier Service", () => {
  beforeEach(async () => {
    // Mock the FanCourier client to avoid real API calls
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
  });

  describe("generateShippingLabel", () => {
    it("returns an error when FanCourier config is not set up", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      const sellerOrder = await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      const result = await carrierService.generateShippingLabel({
        sellerOrderId: sellerOrder.id,
        recipientName: "John Doe",
        recipientPhone: "0123456789",
        recipientCity: "Bucharest",
        recipientCounty: "Bucharest",
        recipientPostalCode: "010101",
        recipientAddress: "Main St 1",
      });

      expect(result.ok).toBe(false);
    });

    it("returns an error when seller order is not found", async () => {
      const result = await carrierService.generateShippingLabel({
        sellerOrderId: "invalid-id",
        recipientName: "John Doe",
        recipientPhone: "0123456789",
        recipientCity: "Bucharest",
        recipientCounty: "Bucharest",
        recipientPostalCode: "010101",
        recipientAddress: "Main St 1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("not found");
      }
    });

    it("stores the tracking number and label URL on successful label generation", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      const sellerOrder = await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      // Set up a mock FanCourier config
      await carrierConfig.upsertCarrierConfig("fancourier", "test", "test-user", "test-pass", "7032158");

      // Mock FAN Courier: login, then intern-awb
      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/login")) {
          return Response.json({ status: "success", data: { token: "tok", expiresAt: "2099-01-01 00:00:00" } });
        }
        if (url.includes("/intern-awb")) {
          return Response.json({ response: [{ awbNumber: 2228300120233, errors: null }] });
        }
        return new Response("unexpected " + url, { status: 500 });
      });

      const result = await carrierService.generateShippingLabel({
        sellerOrderId: sellerOrder.id,
        recipientName: "John Doe",
        recipientPhone: "0123456789",
        recipientCity: "Bucharest",
        recipientCounty: "Bucharest",
        recipientPostalCode: "010101",
        recipientAddress: "Main St 1",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.trackingNumber).toBe("2228300120233");
        expect(result.labelUrl).toBe(`/api/seller/orders/${sellerOrder.id}/label`);

        // Verify the database was updated
        const updated = await prisma.sellerOrder.findUnique({
          where: { id: sellerOrder.id },
        });
        expect(updated?.trackingNumber).toBe("2228300120233");
        expect(updated?.labelUrl).toBeTruthy();
      }
    });
  });

  describe("updateTrackingStatus", () => {
    it("updates the status when it changes", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      const sellerOrder = await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      // Set initial tracking info
      await prisma.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          trackingNumber: "FC12345678",
          carrierStatus: "REGISTERED",
        },
      });

      const result = await carrierService.updateTrackingStatus(
        sellerOrder.id,
        "IN_TRANSIT"
      );

      expect(result.changed).toBe(true);
      expect(result.previousStatus).toBe("REGISTERED");

      const updated = await prisma.sellerOrder.findUnique({
        where: { id: sellerOrder.id },
      });
      expect(updated?.carrierStatus).toBe("IN_TRANSIT");
      expect(updated?.lastTrackedAt).not.toBeNull();
    });

    it("sets deliveredAt when status changes to DELIVERED", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      const sellerOrder = await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      await prisma.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          trackingNumber: "FC12345678",
          carrierStatus: "OUT_FOR_DELIVERY",
        },
      });

      await carrierService.updateTrackingStatus(sellerOrder.id, "DELIVERED");

      const updated = await prisma.sellerOrder.findUnique({
        where: { id: sellerOrder.id },
      });
      expect(updated?.carrierStatus).toBe("DELIVERED");
      expect(updated?.deliveredAt).not.toBeNull();
    });

    it("does not change status when the new status is the same", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      const sellerOrder = await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      await prisma.sellerOrder.update({
        where: { id: sellerOrder.id },
        data: {
          trackingNumber: "FC12345678",
          carrierStatus: "IN_TRANSIT",
        },
      });

      const result = await carrierService.updateTrackingStatus(
        sellerOrder.id,
        "IN_TRANSIT"
      );

      expect(result.changed).toBe(false);
    });

    it("returns an error for a non-existent seller order", async () => {
      const result = await carrierService.updateTrackingStatus(
        "invalid-id",
        "IN_TRANSIT"
      );

      expect(result.updated).toBe(false);
    });
  });

  describe("syncCarrierTracking", () => {
    it("returns a summary of synced shipments", async () => {
      const result = await carrierService.syncCarrierTracking();

      expect(result.synced).toBeDefined();
      expect(result.changed).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.synced).toBeGreaterThanOrEqual(0);
    });

    it("skips seller orders without tracking numbers", async () => {
      const seller = await createApprovedSeller();
      const buyer = await createBuyer();
      const category = await createCategory();
      const product = await createActiveProduct(seller.profile.id, category.id, { price: 100 });
      await createOrder(buyer.id, seller.profile.id, product.variants[0].id);

      const result = await carrierService.syncCarrierTracking();

      // Should not error, just skip the order without tracking
      expect(result.synced).toBe(0);
    });
  });
});
