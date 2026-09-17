import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCartWithItems } from "@/server/data/cart";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CartItemRow } from "@/components/cart/CartItemRow";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { formatPrice } from "@/lib/format";

type Props = {
  searchParams: Promise<{ verify?: string }>;
};

export default async function CartPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/cart");

  const { verify } = await searchParams;
  const { items } = await getCartWithItems(session.user.id);

  const sellers = new Map<
    string,
    { storeName: string; storeSlug: string; items: typeof items }
  >();
  for (const item of items) {
    const seller = item.productVariant.product.seller;
    if (!sellers.has(seller.id)) {
      sellers.set(seller.id, { storeName: seller.storeName, storeSlug: seller.storeSlug, items: [] });
    }
    sellers.get(seller.id)!.items.push(item);
  }

  const grandTotal = items.reduce(
    (sum, item) => sum + Number(item.productVariant.price) * item.quantity,
    0
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Your cart</h1>

      {verify === "1" && (
        <Card className="mb-6 flex flex-col gap-2 border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>Verify your email before checking out.</p>
          <ResendVerificationButton email={session.user.email ?? ""} />
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
          <p>Your cart is empty.</p>
          <Link href="/products" className={buttonVariants()}>
            Browse products
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(sellers.values()).map((seller) => {
            const subtotal = seller.items.reduce(
              (sum, item) => sum + Number(item.productVariant.price) * item.quantity,
              0
            );
            return (
              <Card key={seller.storeSlug} className="p-4">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Sold by {seller.storeName}
                </p>
                <div className="divide-y">
                  {seller.items.map((item) => (
                    <CartItemRow key={item.id} item={item} />
                  ))}
                </div>
                <p className="mt-2 text-right text-sm text-muted-foreground">
                  Subtotal: <span className="font-medium text-foreground">{formatPrice(subtotal)}</span>
                </p>
              </Card>
            );
          })}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-lg font-semibold">Total: {formatPrice(grandTotal)}</p>
            <Link href="/checkout" className={buttonVariants()}>
              Checkout
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
