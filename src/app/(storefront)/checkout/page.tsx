import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCartWithItems } from "@/server/data/cart";
import { getAddressesForAccount } from "@/server/services/address-service";
import { Card } from "@/components/ui/card";
import { AddressForm } from "@/components/checkout/AddressForm";
import { formatPrice } from "@/lib/format";

export default async function CheckoutPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/checkout");
  if (!session.user.emailVerifiedAt) redirect("/cart?verify=1");

  // Fetched fresh here — a separate request from the cart page, nothing caches this in between.
  const [{ items }, savedAddresses] = await Promise.all([
    getCartWithItems(session.user.id),
    getAddressesForAccount(session.user.id),
  ]);
  if (items.length === 0) redirect("/cart");

  const grandTotal = items.reduce(
    (sum, item) => sum + Number(item.productVariant.price) * item.quantity,
    0
  );
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
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
