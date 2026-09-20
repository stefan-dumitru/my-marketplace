import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

export function createAuditLog(input: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({ data: input });
}

export function listAuditLogEntries(opts?: { take?: number; page?: number }) {
  const { page } = opts ?? {};
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    ...(page
      ? { skip: (page - 1) * DEFAULT_PAGE_SIZE, take: DEFAULT_PAGE_SIZE + 1 }
      : { take: opts?.take ?? 100 }),
    include: { actor: { select: { name: true, email: true } } },
  });
}
