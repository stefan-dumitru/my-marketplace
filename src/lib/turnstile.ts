import "server-only";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Fail-closed by default (CLAUDE.md's default-deny posture): a missing/expired/invalid token,
 * or the Cloudflare API call itself failing, all block the action. The one exception is local
 * dev with no TURNSTILE_SECRET_KEY configured — verification is skipped entirely so the app
 * stays usable without a Cloudflare account, same fallback pattern as RESEND_API_KEY in
 * lib/email.ts. In production, a missing secret key fails closed instead of skipping, since
 * skipping there would silently disable the protection.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    if (process.env.NODE_ENV === "production") {
      logger.error("TURNSTILE_SECRET_KEY is not set in production — failing closed");
      return false;
    }
    return true;
  }

  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;

    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    logger.error({ err }, "Turnstile verification request failed");
    return false;
  }
}

/**
 * Server-only: reads the per-request CSP nonce (see proxy.ts) so a Turnstile widget's script tag
 * can be trusted under the strict script-src policy. Returns null when Turnstile isn't
 * configured at all (no TURNSTILE_SITE_KEY) — callers should skip rendering the widget entirely
 * in that case, same graceful-degradation posture as the secret-key check above.
 */
export async function getTurnstileClientConfig(): Promise<{ siteKey: string; nonce: string } | null> {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  const nonce = (await headers()).get("x-nonce") ?? "";
  return { siteKey, nonce };
}
