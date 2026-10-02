import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { SubscriptionActions } from "@/components/account/SubscriptionActions";
import { SHIPPING_FEE_PER_SELLER } from "@/lib/constants";
import { isDead, isEntitled } from "@/lib/subscription";
import { formatPrice } from "@/lib/format";
import { getSubscriptionByUserId } from "@/server/data/subscriptions";
import { getSubscriptionPriceLabel, reconcileSubscriptionForUser } from "@/server/services/subscription-service";

type Props = {
  searchParams: Promise<{ checkout?: string }>;
};

export default async function SubscriptionPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account/subscription");

  const { checkout } = await searchParams;
  let subscription = await getSubscriptionByUserId(session.user.id);

  // Back from Stripe before the webhook has landed: pull the state directly instead of showing a
  // paid-but-unsubscribed page.
  if (checkout === "success" && !isEntitled(subscription)) {
    await reconcileSubscriptionForUser(session.user.id);
    subscription = await getSubscriptionByUserId(session.user.id);
  }

  const entitled = isEntitled(subscription);
  const needsAttention = !!subscription && !entitled && !isDead(subscription.status);
  const priceLabel = await getSubscriptionPriceLabel();
  const periodEnd = subscription?.currentPeriodEnd.toLocaleDateString("ro-RO", { dateStyle: "long" });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Free shipping subscription</h1>

      {checkout === "success" && entitled && (
        <Card role="status" className="p-4 text-sm">
          You&apos;re subscribed — shipping is now free on your orders.
        </Card>
      )}
      {checkout === "success" && !entitled && !needsAttention && (
        <Card role="status" className="p-4 text-sm">
          We&apos;re still confirming your payment. Refresh in a few seconds.
        </Card>
      )}
      {checkout === "cancelled" && (
        <Card role="status" className="p-4 text-sm">
          Checkout cancelled — you haven&apos;t been charged.
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-6 text-sm">
        <p>
          Shipping normally costs <strong>{formatPrice(SHIPPING_FEE_PER_SELLER)}</strong> per seller on every order.
          Subscribe and shipping is <strong>free on every order</strong>, from every seller.
        </p>
        {priceLabel && (
          <p>
            Price: <strong>{priceLabel}</strong> · cancel anytime
          </p>
        )}

        {entitled && subscription && (
          <>
            <p className="font-medium">Your subscription is active.</p>
            <p className="text-muted-foreground">
              {subscription.cancelAtPeriodEnd
                ? `It ends on ${periodEnd} — you keep free shipping until then.`
                : `Renews on ${periodEnd}.`}
            </p>
            <SubscriptionActions mode="manage" />
          </>
        )}

        {needsAttention && (
          <>
            <p role="alert" className="font-medium text-destructive">
              There&apos;s a problem with your payment, so free shipping is paused.
            </p>
            <p className="text-muted-foreground">Update your payment method to restore it.</p>
            <SubscriptionActions mode="manage" />
          </>
        )}

        {!entitled && !needsAttention && <SubscriptionActions mode="subscribe" />}
      </Card>
    </div>
  );
}
