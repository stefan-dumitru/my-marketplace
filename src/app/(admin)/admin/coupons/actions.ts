"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { couponSchema, type CouponFormInput } from "@/lib/validations/coupon";
import {
  createCouponForAdmin,
  setCouponActiveForAdmin,
  updateCouponForAdmin,
  type CouponMutationResult,
} from "@/server/services/coupon-service";

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/coupons");
  if (session.user.role !== "admin") redirect("/");
  return session.user.id;
}

// The action is the trust boundary: re-validate with the same schema the form used, since a
// hand-crafted call skips the client entirely.
function parseCoupon(input: CouponFormInput) {
  const parsed = couponSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return {
    ok: false as const,
    result: {
      ok: false,
      fieldErrors,
      formError: "Please fix the errors above and try again.",
    } satisfies CouponMutationResult,
  };
}

export async function createCouponAction(input: CouponFormInput): Promise<CouponMutationResult> {
  const actorUserId = await requireAdmin();
  const parsed = parseCoupon(input);
  if (!parsed.ok) return parsed.result;

  const result = await createCouponForAdmin(parsed.data, actorUserId);
  revalidatePath("/admin/coupons");
  return result;
}

export async function updateCouponAction(id: string, input: CouponFormInput): Promise<CouponMutationResult> {
  const actorUserId = await requireAdmin();
  const parsed = parseCoupon(input);
  if (!parsed.ok) return parsed.result;

  const result = await updateCouponForAdmin(id, parsed.data, actorUserId);
  revalidatePath("/admin/coupons");
  return result;
}

export async function setCouponActiveAction(id: string, isActive: boolean) {
  const actorUserId = await requireAdmin();
  await setCouponActiveForAdmin(id, isActive, actorUserId);
  revalidatePath("/admin/coupons");
}
