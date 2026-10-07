import { requireAdminPage } from "@/lib/page-guards";
import { getPayoutHistoryForAdmin } from "@/server/services/payout-service";
import { PayoutRow } from "@/components/admin/PayoutRow";
import { RunPayoutBatchButton } from "@/components/admin/RunPayoutBatchButton";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminPayoutsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/payouts");
  const page = parsePage((await searchParams).page);
  const { payouts, hasNextPage } = await getPayoutHistoryForAdmin(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payouts</h1>
        <RunPayoutBatchButton />
      </div>

      {payouts.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No payouts released yet.</Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {payouts.map((payout) => (
              <PayoutRow key={payout.id} payout={payout} />
            ))}
          </div>
          <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/payouts" />
        </>
      )}
    </div>
  );
}
