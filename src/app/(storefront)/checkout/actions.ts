"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { addressSchema, type AddressInput } from "@/lib/validations/checkout";
import { checkoutCart, retryOrderPayment } from "@/server/services/order-service";
import { createAddress } from "@/server/services/address-service";

export async function createCheckoutSessionAction(input: AddressInput, saveAddress?: boolean) {
  // Independently re-verified — this Action is its own entry point, not protected by the
  // checkout page's redirects just because the form that called it was rendered there.
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/checkout");
  if (!session.user.emailVerifiedAt) redirect("/cart?verify=1");

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, formError: "Please fix the errors above and try again." };
  }

  if (saveAddress) {
    // Best-effort — an address-book save failing never blocks checkout itself, same posture
    // as every other side-effect-not-core-to-the-transaction write in this codebase (e.g.
    // seller-service.ts's application-received email).
    await createAddress(session.user.id, { ...parsed.data, isDefault: false }).catch(() => {});
  }

  const result = await checkoutCart(session.user.id, session.user.email ?? "", parsed.data);

  if (result.ok) {
    redirect(result.redirectUrl);
  }
  if ("failedOrderId" in result) {
    redirect(`/checkout/failed?orderId=${result.failedOrderId}`);
  }
  return result;
}

export async function retryOrderPaymentAction(orderId: string) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/orders");

  const result = await retryOrderPayment(session.user.id, orderId);
  if (result.ok) {
    redirect(result.redirectUrl);
  }
  return result;
}
