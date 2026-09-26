import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addToCart, updateCartItemQuantity, removeFromCart, purgeAbandonedCarts } from "@/server/services/cart-service";
import { createBuyer, createApprovedSeller, createCategory, createActiveProduct } from "@test/helpers";

describe("addToCart", () => {
  it("adds a new item to the buyer's cart", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);

    const result = await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 2 });

    expect(result.ok).toBe(true);
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });
    expect(item.quantity).toBe(2);
  });

  it("adding the same product again increments the existing quantity", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 10 });

    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 2 });
    const result = await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 3 });

    expect(result.ok).toBe(true);
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });
    expect(item.quantity).toBe(5);
  });

  it("caps the incremented quantity at the available stock", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 4 });

    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 3 });
    const result = await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 3 });

    expect(result.ok).toBe(true);
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });
    expect(item.quantity).toBe(4);
  });

  it("rejects adding a nonexistent product variant", async () => {
    const buyer = await createBuyer();

    const result = await addToCart(buyer.id, { productVariantId: crypto.randomUUID(), quantity: 1 });

    expect(result.ok).toBe(false);
  });

  it("rejects adding an out-of-stock product", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 0 });

    const result = await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });

    expect(result.ok).toBe(false);
  });

  it("rejects adding a product from an inactive listing", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { status: "inactive" });

    const result = await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });

    expect(result.ok).toBe(false);
  });
});

describe("updateCartItemQuantity", () => {
  it("updates the quantity of an existing cart item", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });

    const result = await updateCartItemQuantity(buyer.id, { cartItemId: item.id, quantity: 5 });

    expect(result.ok).toBe(true);
    const updated = await prisma.cartItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.quantity).toBe(5);
  });

  it("rejects updating an item that isn't in the buyer's own cart", async () => {
    const buyer = await createBuyer();
    const otherBuyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });

    const result = await updateCartItemQuantity(otherBuyer.id, { cartItemId: item.id, quantity: 5 });

    expect(result.ok).toBe(false);
  });
});

describe("removeFromCart", () => {
  it("removes an item from the buyer's cart", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });

    const result = await removeFromCart(buyer.id, { cartItemId: item.id });

    expect(result.ok).toBe(true);
    const gone = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(gone).toBeNull();
  });

  it("rejects removing an item that isn't in the buyer's own cart", async () => {
    const buyer = await createBuyer();
    const otherBuyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id);
    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    const item = await prisma.cartItem.findUniqueOrThrow({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: product.variants[0].id } },
    });

    const result = await removeFromCart(otherBuyer.id, { cartItemId: item.id });

    expect(result.ok).toBe(false);
    const stillThere = await prisma.cartItem.findUnique({ where: { id: item.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe("purgeAbandonedCarts", () => {
  it("deletes cart items untouched for 30+ days but keeps recently-touched ones", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const staleProduct = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    const freshProduct = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    await addToCart(buyer.id, { productVariantId: staleProduct.variants[0].id, quantity: 1 });
    await addToCart(buyer.id, { productVariantId: freshProduct.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id, productVariantId: staleProduct.variants[0].id },
      data: { updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    const result = await purgeAbandonedCarts();

    expect(result.count).toBe(1);
    const remaining = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].productVariantId).toBe(freshProduct.variants[0].id);
  });

  it("never deletes the Cart row itself", async () => {
    const buyer = await createBuyer();
    const { profile } = await createApprovedSeller();
    const category = await createCategory();
    const product = await createActiveProduct(profile.id, category.id, { stockQty: 10 });
    await addToCart(buyer.id, { productVariantId: product.variants[0].id, quantity: 1 });
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: buyer.id } });
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id },
      data: { updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });

    await purgeAbandonedCarts();

    const stillThere = await prisma.cart.findUnique({ where: { id: cart.id } });
    expect(stillThere).not.toBeNull();
  });
});
