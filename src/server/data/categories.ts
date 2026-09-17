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
