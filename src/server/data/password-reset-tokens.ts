import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — shorter than email verification's 24h, see schema.prisma

export async function createPasswordResetToken(email: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  // An email can only have one outstanding reset token at a time — replace any existing one so
  // an old link a user might still have lying around stops working once a new one is issued.
  await prisma.passwordResetToken.deleteMany({ where: { identifier: email } });
  await prisma.passwordResetToken.create({ data: { identifier: email, token, expires } });

  return token;
}

/** Atomically looks up and deletes the token so it can only ever be consumed once. */
export async function consumePasswordResetToken(email: string, token: string) {
  const deleted = await prisma.passwordResetToken.deleteMany({
    where: { identifier: email, token, expires: { gt: new Date() } },
  });

  return deleted.count === 1;
}
