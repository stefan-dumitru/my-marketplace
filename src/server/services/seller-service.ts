import "server-only";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { sellerApplicationSchema, type SellerApplicationInput } from "@/lib/validations/seller";
import {
  approveSellerProfileAndPromoteUser,
  createSellerApplication,
  getSellerProfileById,
  getSellerProfileByStoreSlug,
  getSellerProfileByUserId,
  rejectSellerApplication as rejectSellerApplicationData,
} from "@/server/data/seller-profiles";
import { slugify } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { getUserById } from "@/server/data/users";

export type ApplyResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof SellerApplicationInput, string>>; formError?: string };

export type ApproveResult = { ok: true } | { ok: false; formError: string };
export type RejectResult = { ok: true } | { ok: false; formError: string };

async function uniqueStoreSlug(storeName: string): Promise<string> {
  const base = slugify(storeName) || "store";
  let candidate = base;
  let suffix = 2;
  // Mirrors the email-uniqueness pre-check pattern in auth-service.ts's registerUser — same
  // small accepted TOCTOU window, not a new risk pattern for this codebase.
  while (await getSellerProfileByStoreSlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function applyForSellerAccount(
  userId: string,
  input: SellerApplicationInput
): Promise<ApplyResult> {
  const parsed = sellerApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, formError: "Please fix the errors above and try again." };
  }

  const existing = await getSellerProfileByUserId(userId);
  if (existing) {
    const messages: Record<string, string> = {
      pending: "You already have an application under review.",
      approved: "You're already an approved seller.",
      rejected: "Your previous application wasn't approved. Contact support for next steps.",
      suspended: "Your seller account is suspended. Contact support.",
    };
    return { ok: false, formError: messages[existing.status] ?? "You already have a seller profile." };
  }

  const { storeName, description, businessRegistrationNumber, logoUrl } = parsed.data;
  const storeSlug = await uniqueStoreSlug(storeName);

  await createSellerApplication({
    userId,
    storeName,
    storeSlug,
    description: description || undefined,
    businessRegistrationNumber,
    logoUrl: logoUrl || undefined,
  });

  const user = await getUserById(userId);
  if (user) {
    await sendEmail({
      to: user.email,
      subject: "Seller application received",
      html: `<p>Thanks for applying to sell on My Marketplace. We'll review your application and let you know once it's decided.</p>`,
      text: `Thanks for applying to sell on My Marketplace. We'll review your application and let you know once it's decided.`,
    }).catch(() => {
      // Best-effort notification — an email failure shouldn't fail an otherwise-successful
      // application, matching operations.md's "app still completes even if the email is delayed."
    });
  }

  return { ok: true };
}

export async function approveSellerApplication(sellerProfileId: string): Promise<ApproveResult> {
  const profile = await getSellerProfileById(sellerProfileId);
  if (!profile || profile.status !== "pending") {
    return { ok: false, formError: "This application is no longer pending." };
  }

  await approveSellerProfileAndPromoteUser(sellerProfileId, profile.userId);

  const user = await getUserById(profile.userId);
  if (user) {
    await sendEmail({
      to: user.email,
      subject: "You're approved to sell on My Marketplace",
      html: `<p>Congratulations — your seller application for "${profile.storeName}" has been approved. You can now list products.</p>`,
      text: `Congratulations — your seller application for "${profile.storeName}" has been approved. You can now list products.`,
    }).catch(() => {});
  }

  return { ok: true };
}

export async function rejectSellerApplication(sellerProfileId: string): Promise<RejectResult> {
  const profile = await getSellerProfileById(sellerProfileId);
  if (!profile || profile.status !== "pending") {
    return { ok: false, formError: "This application is no longer pending." };
  }

  await rejectSellerApplicationData(sellerProfileId);

  const user = await getUserById(profile.userId);
  if (user) {
    await sendEmail({
      to: user.email,
      subject: "Update on your seller application",
      html: `<p>Thanks for your interest in selling on My Marketplace. After review, we're not able to approve your application for "${profile.storeName}" at this time.</p>`,
      text: `Thanks for your interest in selling on My Marketplace. After review, we're not able to approve your application for "${profile.storeName}" at this time.`,
    }).catch(() => {});
  }

  return { ok: true };
}

/**
 * Cached per-request so the (seller) gate layout and the pages/actions under it don't each
 * re-run auth() + the SellerProfile lookup within the same render pass.
 */
export const getSellerContext = cache(async () => {
  const session = await auth();
  if (!session) return null;

  const profile = await getSellerProfileByUserId(session.user.id);
  return { session, profile };
});
