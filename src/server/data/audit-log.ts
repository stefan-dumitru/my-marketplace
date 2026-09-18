import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

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

export function listAuditLogEntries(opts?: { take?: number }) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: opts?.take ?? 100,
    include: { actor: { select: { name: true, email: true } } },
  });
}
