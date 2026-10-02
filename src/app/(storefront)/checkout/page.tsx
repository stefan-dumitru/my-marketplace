import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCartWithItems } from "@/server/data/cart";
import { getAddressesForAccount } from "@/server/services/address-service";
import { Card } from "@/components/ui/card";
import { AddressForm } from "@/components/checkout/AddressForm";
import { cartSubtotalCents, resolveCartCoupon } from "@/server/services/coupon-service";
import { fromCents } from "@/lib/coupons";
import { getShippingQuote } from "@/server/services/subscription-service";
import { formatPrice } from "@/lib/format";

export default async function CheckoutPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/checkout");
  if (!session.user.emailVerifiedAt) redirect("/cart?verify=1");

  // Fetched fresh here — a separate request from the cart page, nothing caches this in between.
  const [{ cart, items }, savedAddresses] = await Promise.all([
    getCartWithItems(session.user.id),
    getAddressesForAccount(session.user.id),
  ]);
  if (items.length === 0) redirect("/cart");

  const couponState = await resolveCartCoupon(session.user.id, cart, items);
  const subtotalCents = cartSubtotalCents(items);
  const discountCents = couponState.status === "applied" ? couponState.discountCents : 0;
  const sellerCount = new Set(items.map((i) => i.productVariant.product.seller.id)).size;
  const shipping = await getShippingQuote(session.user.id, sellerCount);
  const shippingCents = shipping.chargedCents;
  // savedAddresses is already ordered default-first, so this is free — no separate query.
  const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? null;

  return (
    <div className="mx-auto grid w-full max-w-4xl flex-1 gap-8 px-4 py-10 sm:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Shipping address</h1>
        <AddressForm savedAddresses={savedAddresses} defaultAddress={defaultAddress} />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <Card className="flex flex-col gap-2 p-4 text-sm">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between">
              <span>
                {item.productVariant.product.name} × {item.quantity}
              </span>
              <span>{formatPrice(Number(item.productVariant.price) * item.quantity)}</span>
            </div>
          ))}
          {couponState.status === "applied" && (
            <div className="flex justify-between text-muted-foreground">
              <span>Discount ({couponState.code})</span>
              <span>−{formatPrice(fromCents(discountCents))}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Shipping ({sellerCount} seller{sellerCount === 1 ? "" : "s"})</span>
            <span>{shipping.waived ? "Free (subscription)" : formatPrice(fromCents(shippingCents))}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>{formatPrice(fromCents(subtotalCents - discountCents + shippingCents))}</span>
          </div>
          {couponState.status === "dropped" && (
            <p role="status" className="text-muted-foreground">
              {couponState.message}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
