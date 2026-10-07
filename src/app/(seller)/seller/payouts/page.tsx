import { requireApprovedSellerPage } from "@/lib/page-guards";
import { getPayoutHistoryForSeller } from "@/server/services/payout-service";
import { reconcileConnectStatus } from "@/server/services/connect-service";
import { ConnectPayoutsCard } from "@/components/seller/ConnectPayoutsCard";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { formatPrice } from "@/lib/format";
import { parsePage } from "@/lib/pagination";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function SellerPayoutsPage({ searchParams }: Props) {
  const { profile } = await requireApprovedSellerPage("/seller/payouts");
  const page = parsePage((await searchParams).page);

  const [payoutsEnabled, { payouts, hasNextPage }] = await Promise.all([
    reconcileConnectStatus(profile.id),
    getPayoutHistoryForSeller(profile.id, page),
  ]);

  const status = !profile.stripeConnectAccountId
    ? "not_connected"
    : payoutsEnabled
      ? "enabled"
      : "onboarding_incomplete";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payouts</h1>

      <ConnectPayoutsCard status={status} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Payout history</h2>
          <a href="/api/seller/reports/payouts" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Download CSV
          </a>
        </div>
        {payouts.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">
            No payouts yet. Delivered orders are held for 14 days before being included in a payout.
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {payouts.map((payout) => (
                <Card key={payout.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">
                      {new Date(payout.periodStart).toLocaleDateString("ro-RO")} –{" "}
                      {new Date(payout.periodEnd).toLocaleDateString("ro-RO")}
                    </p>
                    <p className="text-muted-foreground">
                      {STATUS_LABEL[payout.status] ?? payout.status}
                      {payout.paidAt ? ` · Paid ${new Date(payout.paidAt).toLocaleDateString("ro-RO")}` : ""}
                    </p>
                  </div>
                  <p className="font-medium">{formatPrice(payout.amount)}</p>
                </Card>
              ))}
            </div>
            <Pagination page={page} hasNextPage={hasNextPage} basePath="/seller/payouts" />
          </>
        )}
      </div>
    </div>
  );
}
