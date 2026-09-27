import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { submitReview, getProductReviews, moderateReview, sendReviewReminders } from "@/server/services/review-service";
import { REVIEW_REMINDER_DELAY_DAYS } from "@/lib/constants";
import {
  createBuyer,
  createApprovedSeller,
  createCategory,
  createActiveProduct,
  placeOrder,
  deliverSellerOrder,
} from "@test/helpers";

const REVIEW_INPUT = { rating: 5, title: "Great product", body: "Exactly as described, works well." };

async function placeOrderAndGetItem(buyerId: string, sellerId: string, categoryId: string) {
  const product = await createActiveProduct(sellerId, categoryId, { stockQty: 5 });
  const order = await placeOrder(buyerId, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
  const sellerOrder = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: order.id, sellerId } });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { sellerOrderId: sellerOrder.id } });
  return { product, sellerOrder, orderItem };
}

describe("submitReview", () => {
  it("cannot review an item whose order isn't delivered yet", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);

    const result = await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);

    expect(result.ok).toBe(false);
    const count = await prisma.review.count({ where: { orderItemId: orderItem.id } });
    expect(count).toBe(0);
  });

  it("submits a review once the order is delivered, auto-approved with no admin gate", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder, orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);

    const result = await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);

    expect(result.ok).toBe(true);
    const review = await prisma.review.findFirstOrThrow({ where: { orderItemId: orderItem.id } });
    expect(review.rating).toBe(5);
    expect(review.status).toBe("approved");
  });

  it("rejects a duplicate review for the same order item (P2002 backstop)", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder, orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);

    const result = await submitReview(buyer.id, orderItem.id, { ...REVIEW_INPUT, title: "Second attempt" });

    expect(result.ok).toBe(false);
    const count = await prisma.review.count({ where: { orderItemId: orderItem.id } });
    expect(count).toBe(1);
  });
});

describe("getProductReviews", () => {
  it("lists auto-approved reviews and computes the average rating", async () => {
    const buyerA = await createBuyer();
    const buyerB = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 5 });

    const orderA = await placeOrder(buyerA.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
    const sellerOrderA = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: orderA.id, sellerId: profile.id } });
    const orderItemA = await prisma.orderItem.findFirstOrThrow({ where: { sellerOrderId: sellerOrderA.id } });
    await deliverSellerOrder(sellerOrderA.id);
    await submitReview(buyerA.id, orderItemA.id, { rating: 4, title: "Pretty good", body: "Solid overall quality." });

    const orderB = await placeOrder(buyerB.id, [{ productVariantId: product.variants[0].id, quantity: 1 }]);
    const sellerOrderB = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: orderB.id, sellerId: profile.id } });
    const orderItemB = await prisma.orderItem.findFirstOrThrow({ where: { sellerOrderId: sellerOrderB.id } });
    await deliverSellerOrder(sellerOrderB.id);
    await submitReview(buyerB.id, orderItemB.id, { rating: 2, title: "Not great", body: "Didn't meet expectations." });

    const { reviews, summary } = await getProductReviews(product.id);

    expect(reviews).toHaveLength(2);
    expect(summary.count).toBe(2);
    expect(summary.average).toBe(3);
  });

  it("excludes a review an admin has taken down", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder, orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);
    await prisma.review.updateMany({ where: { orderItemId: orderItem.id }, data: { status: "rejected" } });

    const { reviews, summary } = await getProductReviews(
      (await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItem.id }, include: { productVariant: true } }))
        .productVariant.productId
    );

    expect(reviews).toHaveLength(0);
    expect(summary.count).toBe(0);
  });
});

describe("moderateReview (post-publish takedown/restore)", () => {
  async function submitApprovedReview() {
    const buyer = await createBuyer();
    const admin = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder, orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);
    const review = await prisma.review.findFirstOrThrow({ where: { orderItemId: orderItem.id } });
    return { review, admin };
  }

  it("takes down a live review", async () => {
    const { review, admin } = await submitApprovedReview();

    const result = await moderateReview(review.id, "rejected", admin.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(updated.status).toBe("rejected");
  });

  it("restores a previously taken-down review", async () => {
    const { review, admin } = await submitApprovedReview();
    await moderateReview(review.id, "rejected", admin.id);

    const result = await moderateReview(review.id, "approved", admin.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(updated.status).toBe("approved");
  });

  it("is a no-op when the review is already in the requested state", async () => {
    const { review, admin } = await submitApprovedReview();

    const result = await moderateReview(review.id, "approved", admin.id);

    expect(result.ok).toBe(false);
  });
});

describe("sendReviewReminders", () => {
  async function backdateDelivery(sellerOrderId: string, daysAgo: number) {
    const deliveredAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await prisma.sellerOrder.update({ where: { id: sellerOrderId }, data: { deliveredAt } });
    return deliveredAt;
  }

  it("reminds a buyer about an item that crossed the delay threshold today", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await backdateDelivery(sellerOrder.id, REVIEW_REMINDER_DELAY_DAYS);

    const result = await sendReviewReminders(new Date());

    expect(result.remindersSent).toBe(1);
    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: buyer.id, type: "review_reminder" },
    });
    expect(notification.link).toBe(`/orders/${sellerOrder.orderId}`);
  });

  it("does not remind again once a review already exists", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder, orderItem } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await backdateDelivery(sellerOrder.id, REVIEW_REMINDER_DELAY_DAYS);
    await submitReview(buyer.id, orderItem.id, REVIEW_INPUT);

    const result = await sendReviewReminders(new Date());

    expect(result.remindersSent).toBe(0);
  });

  it("does not remind outside the exact day bucket", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const { sellerOrder } = await placeOrderAndGetItem(buyer.id, profile.id, category.id);
    await deliverSellerOrder(sellerOrder.id);
    await backdateDelivery(sellerOrder.id, REVIEW_REMINDER_DELAY_DAYS + 2);

    const result = await sendReviewReminders(new Date());

    expect(result.remindersSent).toBe(0);
  });
});
