import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  COUPON_FAILURE_MESSAGE,
  COUPON_NOT_FOUND_MESSAGE,
  evaluateCoupon,
  normalizeCouponCode,
  toCents,
} from "@/lib/coupons";
import type { CouponInput } from "@/lib/validations/coupon";
import { getCartWithItems } from "@/server/data/cart";
import {
  couponToRules,
  createCouponRecord,
  findUnpaidOrderHoldingCoupon,
  getCouponByCode,
  getCouponById,
  getCouponUsageForUser,
  listCouponsForAdmin,
  setCartCoupon,
  updateCouponRecord,
  type CouponWriteData,
} from "@/server/data/coupons";
import { createAuditLog } from "@/server/data/audit-log";
import { splitPage } from "@/lib/pagination";

// --- Buyer side: applying a code to the cart ---

export type ApplyCouponResult = { ok: true } | { ok: false; formError: string };

type CartItems = Awaited<ReturnType<typeof getCartWithItems>>["items"];

export function cartSubtotalCents(items: CartItems) {
  return items.reduce((sum, item) => sum + toCents(Number(item.productVariant.price)) * item.quantity, 0);
}

/**
 * Validates the code against the buyer's *current* cart and, if it holds, selects it on the cart.
 * This is a convenience check only — checkout re-validates and atomically reserves the redemption
 * (createOrderFromCart), so a code that stops being valid between here and payment is still caught.
 */
export async function applyCouponCode(userId: string, rawCode: string): Promise<ApplyCouponResult> {
  const { cart, items } = await getCartWithItems(userId);
  if (items.length === 0) return { ok: false, formError: "Your cart is empty." };

  const coupon = await getCouponByCode(normalizeCouponCode(rawCode));
  // Unknown and disabled codes share one message on purpose — see COUPON_FAILURE_MESSAGE.
  if (!coupon) return { ok: false, formError: COUPON_NOT_FOUND_MESSAGE };

  const usage = await getCouponUsageForUser(coupon.id, userId);
  const evaluation = evaluateCoupon(couponToRules(coupon), {
    subtotalCents: cartSubtotalCents(items),
    now: new Date(),
    ...usage,
  });
  if (!evaluation.ok) {
    if (evaluation.reason === "user_limit_reached" && (await findUnpaidOrderHoldingCoupon(userId, coupon.id))) {
      return {
        ok: false,
        formError:
          "This code is already attached to an unpaid order of yours. Complete that payment from your orders page.",
      };
    }
    return { ok: false, formError: COUPON_FAILURE_MESSAGE[evaluation.reason] };
  }

  await setCartCoupon(cart.id, coupon.id);
  return { ok: true };
}

export async function removeCartCoupon(userId: string) {
  const { cart } = await getCartWithItems(userId);
  await setCartCoupon(cart.id, null);
}

export type CartCouponState =
  | { status: "none" }
  | { status: "applied"; code: string; discountCents: number }
  | { status: "dropped"; message: string };

/**
 * Re-evaluates the cart's selected code against what's in the cart right now. The cart changes
 * after a code is applied (items removed, quantities lowered below the minimum), so validity is
 * recomputed on every render rather than trusted from when it was applied; a code that no longer
 * holds is cleared and reported once.
 */
export async function resolveCartCoupon(
  userId: string,
  cart: { id: string; couponId: string | null },
  items: CartItems
): Promise<CartCouponState> {
  if (!cart.couponId) return { status: "none" };

  const coupon = await getCouponById(cart.couponId);
  const usage = coupon ? await getCouponUsageForUser(coupon.id, userId) : null;
  const evaluation =
    coupon && usage
      ? evaluateCoupon(couponToRules(coupon), { subtotalCents: cartSubtotalCents(items), now: new Date(), ...usage })
      : null;

  if (coupon && evaluation?.ok) {
    return { status: "applied", code: coupon.code, discountCents: evaluation.discountCents };
  }

  await setCartCoupon(cart.id, null);
  const message = evaluation && !evaluation.ok ? COUPON_FAILURE_MESSAGE[evaluation.reason] : COUPON_NOT_FOUND_MESSAGE;
  return { status: "dropped", message: `${message} The code was removed from your cart.` };
}

// --- Admin side ---

export type CouponMutationResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Partial<Record<keyof CouponInput, string>>; formError?: string };

// The form speaks calendar dates; stored instants are UTC. An end date is inclusive of that whole
// day, so it becomes 23:59:59.999 rather than midnight (which would expire the code a day early).
function dateStart(date: string | undefined) {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}
function dateEnd(date: string | undefined) {
  return date ? new Date(`${date}T23:59:59.999Z`) : null;
}

function toWriteData(input: CouponInput): CouponWriteData {
  return {
    code: input.code,
    type: input.type,
    value: input.value,
    minOrderAmount: input.minOrderAmount ?? null,
    maxDiscountAmount: input.type === "percentage" ? (input.maxDiscountAmount ?? null) : null,
    startsAt: dateStart(input.startsAt),
    expiresAt: dateEnd(input.expiresAt),
    maxRedemptionsTotal: input.maxRedemptionsTotal ?? null,
    maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? null,
    firstOrderOnly: input.firstOrderOnly,
    isActive: input.isActive,
  };
}

/** JSON-safe copy for the audit log (Date/Decimal aren't valid Prisma JSON input). */
function auditShape(data: Partial<CouponWriteData>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : (v ?? null)])
  ) as Prisma.InputJsonObject;
}

const DUPLICATE_CODE_ERROR = { code: "A coupon with this code already exists." };

export async function createCouponForAdmin(input: CouponInput, actorUserId: string): Promise<CouponMutationResult> {
  const data = toWriteData(input);
  if (await getCouponByCode(data.code)) return { ok: false, fieldErrors: DUPLICATE_CODE_ERROR };

  try {
    const created = await createCouponRecord(data, actorUserId);
    await createAuditLog({
      actorUserId,
      action: "coupon_created",
      entityType: "Coupon",
      entityId: created.id,
      afterValue: auditShape(data),
    });
  } catch (err) {
    // Race-safe backstop behind the existence check above (code has a unique index).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: DUPLICATE_CODE_ERROR };
    }
    throw err;
  }
  return { ok: true };
}

export async function updateCouponForAdmin(
  id: string,
  input: CouponInput,
  actorUserId: string
): Promise<CouponMutationResult> {
  const existing = await getCouponById(id);
  if (!existing) return { ok: false, formError: "Coupon not found." };

  const data = toWriteData(input);
  if (data.code !== existing.code) {
    return { ok: false, fieldErrors: { code: "A coupon's code can't be changed after it's created." } };
  }
  // Once redeemed, the discount terms are part of real orders' history — changing them would make
  // the coupon page disagree with those orders. Make a new coupon instead.
  if (existing.redemptionCount > 0 && (data.type !== existing.type || data.value !== Number(existing.value))) {
    return {
      ok: false,
      formError: "This coupon has already been redeemed, so its type and value can't change. Create a new coupon instead.",
    };
  }

  // The code itself never changes (checked above), so it is left out of the write and the audit diff.
  const changes: Partial<CouponWriteData> = { ...data };
  delete changes.code;
  await updateCouponRecord(id, changes);
  await createAuditLog({
    actorUserId,
    action: "coupon_updated",
    entityType: "Coupon",
    entityId: id,
    beforeValue: auditShape({
      type: existing.type,
      value: Number(existing.value),
      minOrderAmount: existing.minOrderAmount === null ? null : Number(existing.minOrderAmount),
      maxDiscountAmount: existing.maxDiscountAmount === null ? null : Number(existing.maxDiscountAmount),
      startsAt: existing.startsAt,
      expiresAt: existing.expiresAt,
      maxRedemptionsTotal: existing.maxRedemptionsTotal,
      maxRedemptionsPerUser: existing.maxRedemptionsPerUser,
      firstOrderOnly: existing.firstOrderOnly,
      isActive: existing.isActive,
    }),
    afterValue: auditShape(changes),
  });
  return { ok: true };
}

export async function setCouponActiveForAdmin(id: string, isActive: boolean, actorUserId: string) {
  const existing = await getCouponById(id);
  if (!existing || existing.isActive === isActive) return { ok: false as const };

  await updateCouponRecord(id, { isActive });
  await createAuditLog({
    actorUserId,
    action: isActive ? "coupon_activated" : "coupon_deactivated",
    entityType: "Coupon",
    entityId: id,
    beforeValue: { isActive: existing.isActive },
    afterValue: { isActive },
  });
  return { ok: true as const };
}

export async function getCouponsForAdmin(page?: number) {
  const rows = await listCouponsForAdmin({ page });
  const { items, hasNextPage } = splitPage(rows);
  return { coupons: items, hasNextPage };
}

export async function getCouponForAdminEdit(id: string) {
  const coupon = await getCouponById(id);
  if (!coupon) return null;
  return {
    id: coupon.id,
    redeemed: coupon.redemptionCount > 0,
    initialValues: {
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      minOrderAmount: coupon.minOrderAmount === null ? "" : Number(coupon.minOrderAmount),
      maxDiscountAmount: coupon.maxDiscountAmount === null ? "" : Number(coupon.maxDiscountAmount),
      startsAt: coupon.startsAt ? coupon.startsAt.toISOString().slice(0, 10) : "",
      expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString().slice(0, 10) : "",
      maxRedemptionsTotal: coupon.maxRedemptionsTotal ?? "",
      maxRedemptionsPerUser: coupon.maxRedemptionsPerUser ?? "",
      firstOrderOnly: coupon.firstOrderOnly,
      isActive: coupon.isActive,
    },
  };
}
