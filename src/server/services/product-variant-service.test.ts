import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addProductVariant,
  removeProductVariant,
  updateProductVariant,
} from "@/server/services/product-variant-service";
import {
  createActiveProduct,
  createApprovedSeller,
  createBuyer,
  createCategory,
  placeOrder,
} from "@test/helpers";

const attrs = [{ key: "Size", value: "M" }];

async function sellerWithProduct() {
  const seller = await createApprovedSeller();
  const category = await createCategory();
  const product = await createActiveProduct(seller.profile.id, category.id, { price: 50, stockQty: 5 });
  return { seller, product, defaultVariant: product.variants[0] };
}

describe("addProductVariant", () => {
  it("adds a variant with its attributes stored as a key/value record", async () => {
    const { seller, product } = await sellerWithProduct();

    const result = await addProductVariant(seller.profile.id, product.id, {
      sku: "TSHIRT-M",
      attributes: [
        { key: "Size", value: "M" },
        { key: "Colour", value: "Blue" },
      ],
      price: 59.9,
      stockQty: 3,
    });

    expect(result).toEqual({ ok: true });
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { sku: "TSHIRT-M" } });
    expect(variant.attributes).toEqual({ Size: "M", Colour: "Blue" });
    expect(Number(variant.price)).toBe(59.9);
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(2);
  });

  it("rejects a SKU the seller already uses, including the product's default variant", async () => {
    const { seller, product, defaultVariant } = await sellerWithProduct();

    const result = await addProductVariant(seller.profile.id, product.id, {
      sku: defaultVariant.sku,
      attributes: attrs,
      price: 10,
      stockQty: 1,
    });

    expect(result).toEqual({ ok: false, fieldErrors: { sku: "You already have a variant with this SKU." } });
  });

  it("requires at least one attribute and a positive price", async () => {
    const { seller, product } = await sellerWithProduct();

    expect((await addProductVariant(seller.profile.id, product.id, { sku: "A", attributes: [], price: 10, stockQty: 1 })).ok).toBe(false);
    expect((await addProductVariant(seller.profile.id, product.id, { sku: "B", attributes: attrs, price: 0, stockQty: 1 })).ok).toBe(false);
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(1);
  });

  it("will not add a variant to another seller's product", async () => {
    const { product } = await sellerWithProduct();
    const intruder = await createApprovedSeller();

    const result = await addProductVariant(intruder.profile.id, product.id, {
      sku: "HIJACK",
      attributes: attrs,
      price: 10,
      stockQty: 1,
    });

    expect(result).toEqual({ ok: false, formError: "Product not found." });
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(1);
  });
});

describe("updateProductVariant", () => {
  it("changes price, stock and attributes but never the SKU", async () => {
    const { seller, product, defaultVariant } = await sellerWithProduct();

    const result = await updateProductVariant(seller.profile.id, product.id, defaultVariant.id, {
      attributes: [{ key: "Colour", value: "Red" }],
      price: 75,
      stockQty: 9,
    });

    expect(result).toEqual({ ok: true });
    const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: defaultVariant.id } });
    expect(Number(after.price)).toBe(75);
    expect(after.stockQty).toBe(9);
    expect(after.attributes).toEqual({ Colour: "Red" });
    expect(after.sku).toBe(defaultVariant.sku);
  });

  it("will not touch another seller's variant", async () => {
    const { product, defaultVariant } = await sellerWithProduct();
    const intruder = await createApprovedSeller();

    const result = await updateProductVariant(intruder.profile.id, product.id, defaultVariant.id, {
      attributes: attrs,
      price: 1,
      stockQty: 0,
    });

    expect(result).toEqual({ ok: false, formError: "Variant not found." });
    expect(Number((await prisma.productVariant.findUniqueOrThrow({ where: { id: defaultVariant.id } })).price)).toBe(50);
  });
});

describe("removeProductVariant", () => {
  async function withSecondVariant() {
    const ctx = await sellerWithProduct();
    await addProductVariant(ctx.seller.profile.id, ctx.product.id, { sku: "SECOND", attributes: attrs, price: 20, stockQty: 4 });
    const second = await prisma.productVariant.findFirstOrThrow({ where: { sku: "SECOND" } });
    return { ...ctx, second };
  }

  it("refuses to remove the only variant of a product", async () => {
    const { seller, product, defaultVariant } = await sellerWithProduct();

    const result = await removeProductVariant(seller.profile.id, product.id, defaultVariant.id);

    expect(result).toEqual({ ok: false, formError: "A product must have at least one variant." });
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(1);
  });

  it("refuses to remove a variant that has order history", async () => {
    const { seller, product, defaultVariant } = await withSecondVariant();
    const buyer = await createBuyer();
    await placeOrder(buyer.id, [{ productVariantId: defaultVariant.id, quantity: 1 }]);

    const result = await removeProductVariant(seller.profile.id, product.id, defaultVariant.id);

    expect(result.ok).toBe(false);
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(2);
  });

  it("removes an unordered variant and clears it from carts", async () => {
    const { seller, product, second } = await withSecondVariant();
    const buyer = await createBuyer();
    const cart = await prisma.cart.create({ data: { userId: buyer.id } });
    await prisma.cartItem.create({ data: { cartId: cart.id, productVariantId: second.id, quantity: 1 } });

    const result = await removeProductVariant(seller.profile.id, product.id, second.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(1);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("reveals nothing about another seller's variant", async () => {
    const { product, second } = await withSecondVariant();
    const intruder = await createApprovedSeller();

    const result = await removeProductVariant(intruder.profile.id, product.id, second.id);

    expect(result).toEqual({ ok: false, formError: "Variant not found." });
    expect(await prisma.productVariant.count({ where: { productId: product.id } })).toBe(2);
  });
});
