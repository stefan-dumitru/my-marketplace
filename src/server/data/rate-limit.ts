import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Fixed-window counter — deliberately not sliding-window/token-bucket, matching security.md's
 * "basic... not adaptive/behavioral" scope for v1 rate limiting. Read-then-write: a small
 * accepted TOCTOU window under concurrent requests for the *same* key, same accepted-risk
 * posture already documented at seller-service.ts's uniqueStoreSlug, not a new risk pattern for
 * this codebase.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number }
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const now = new Date();
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!bucket || bucket.windowEnds <= now) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowEnds: new Date(now.getTime() + opts.windowSeconds * 1000) },
      update: { count: 1, windowEnds: new Date(now.getTime() + opts.windowSeconds * 1000) },
    });
    return { allowed: true };
  }

  if (bucket.count >= opts.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.windowEnds.getTime() - now.getTime()) / 1000),
    };
  }

  await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  return { allowed: true };
}
