import "server-only";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

export function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role?: UserRole;
}) {
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      phone: input.phone || null,
      role: input.role ?? "buyer",
    },
  });
}

export function markEmailVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
}
