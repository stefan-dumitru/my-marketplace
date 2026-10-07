import { describe, expect, it } from "vitest";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import {
  createCategoryForAdmin,
  updateCategoryForAdmin,
} from "@/server/services/category-service";
import { createAdmin, createCategory } from "@test/helpers";

const input = { name: "Gaming Gear", parentId: "", isActive: true, defaultCommissionRate: 0.12 };
const MANAGED_IMAGE = "https://example.public.blob.vercel-storage.com/categories/old.png";

describe("createCategoryForAdmin", () => {
  it("creates a category with a slug derived from its name", async () => {
    const result = await createCategoryForAdmin(input, null);

    expect(result).toEqual({ ok: true });
    const category = await prisma.category.findFirstOrThrow();
    expect(category.slug).toBe("gaming-gear");
    expect(category.parentId).toBeNull();
    expect(Number(category.defaultCommissionRate)).toBe(0.12);
    expect(category.isActive).toBe(true);
  });

  it("gives a second category with the same name a distinct slug", async () => {
    await createCategoryForAdmin(input, null);
    await createCategoryForAdmin(input, null);

    const slugs = (await prisma.category.findMany({ orderBy: { slug: "asc" } })).map((c) => c.slug);
    expect(slugs).toEqual(["gaming-gear", "gaming-gear-2"]);
  });

  it("nests a category under a parent and stores its image", async () => {
    const parent = await createCategory();

    await createCategoryForAdmin({ ...input, parentId: parent.id }, MANAGED_IMAGE);

    const child = await prisma.category.findFirstOrThrow({ where: { parentId: parent.id } });
    expect(child.imageUrl).toBe(MANAGED_IMAGE);
  });

  it("rejects a too-short name and an out-of-range commission rate", async () => {
    expect((await createCategoryForAdmin({ ...input, name: "x" }, null)).ok).toBe(false);
    expect((await createCategoryForAdmin({ ...input, defaultCommissionRate: 1.5 }, null)).ok).toBe(false);
    expect((await createCategoryForAdmin({ ...input, defaultCommissionRate: -0.1 }, null)).ok).toBe(false);
    expect(await prisma.category.count()).toBe(0);
  });
});

describe("updateCategoryForAdmin", () => {
  it("will not make a category its own parent", async () => {
    const admin = await createAdmin();
    const category = await createCategory();

    const result = await updateCategoryForAdmin(category.id, { ...input, parentId: category.id }, admin.id, null);

    expect(result).toEqual({ ok: false, fieldErrors: { parentId: "A category can't be its own parent." } });
  });

  it("reports a category that does not exist", async () => {
    const admin = await createAdmin();
    const result = await updateCategoryForAdmin("missing", input, admin.id, null);
    expect(result).toEqual({ ok: false, formError: "Category not found." });
  });

  it("audits a commission-rate change with the before and after values", async () => {
    const admin = await createAdmin();
    const category = await createCategory();

    await updateCategoryForAdmin(category.id, { ...input, defaultCommissionRate: 0.2 }, admin.id, null);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "category_commission_updated" } });
    expect(log.actorUserId).toBe(admin.id);
    expect(log.entityId).toBe(category.id);
    expect(log.beforeValue).toMatchObject({ defaultCommissionRate: "0.1" });
    expect(log.afterValue).toMatchObject({ defaultCommissionRate: "0.2" });
  });

  it("does not write an audit entry when only the name changes", async () => {
    const admin = await createAdmin();
    const category = await createCategory();

    await updateCategoryForAdmin(category.id, { ...input, name: "Renamed", defaultCommissionRate: 0.1 }, admin.id, null);

    expect(await prisma.auditLog.count()).toBe(0);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: category.id } })).name).toBe("Renamed");
  });

  it("deletes the old stored image when it is replaced, but not when it is kept", async () => {
    const admin = await createAdmin();
    const category = await prisma.category.create({
      data: { name: "With image", slug: "with-image", imageUrl: MANAGED_IMAGE, defaultCommissionRate: 0.1 },
    });

    await updateCategoryForAdmin(category.id, { ...input, defaultCommissionRate: 0.1 }, admin.id, MANAGED_IMAGE);
    expect(del).not.toHaveBeenCalled();

    await updateCategoryForAdmin(category.id, { ...input, defaultCommissionRate: 0.1 }, admin.id, null);
    expect(del).toHaveBeenCalledWith(MANAGED_IMAGE);
  });
});
