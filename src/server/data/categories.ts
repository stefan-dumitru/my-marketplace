import "server-only";
import { prisma } from "@/lib/prisma";

export function listActiveCategories(opts?: { take?: number }) {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    take: opts?.take ?? 200,
  });
}

export function getCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export function listAllCategoriesForAdmin() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { parent: { select: { name: true } } },
  });
}

export function createCategory(data: {
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  defaultCommissionRate: number;
}) {
  return prisma.category.create({ data });
}

/** Verify-then-update: admin-only, but every mutation in this codebase still confirms existence
 * before writing by primary key rather than trusting the id blindly. */
export async function updateCategory(
  id: string,
  data: {
    name: string;
    parentId: string | null;
    imageUrl: string | null;
    isActive: boolean;
    defaultCommissionRate: number;
  }
) {
  const owned = await prisma.category.findFirst({ where: { id }, select: { id: true } });
  if (!owned) return null;

  return prisma.category.update({ where: { id }, data });
}
