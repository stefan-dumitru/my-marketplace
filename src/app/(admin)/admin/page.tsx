import Link from "next/link";
import { getAdminDashboard } from "@/server/services/dashboard-service";
import { StatTile } from "@/components/dashboard/StatTile";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

export default async function AdminHomePage() {
  const stats = await getAdminDashboard();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to marketplace
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="GMV this month" value={formatPrice(stats.gmvThisMonth)} />
        <StatTile label="Discounts given" value={formatPrice(stats.discountsThisMonth)} />
        <StatTile label="Active sellers" value={stats.activeSellers} />
        <StatTile label="Pending approvals" value={stats.pendingSellerApprovals} />
        <StatTile label="Orders today" value={stats.ordersToday} />
        <StatTile label="Reviews taken down" value={stats.takenDownReviews} />
        <StatTile label="Active subscribers" value={stats.activeSubscribers} />
        <StatTile label="Shipping subsidized" value={formatPrice(stats.shippingSubsidizedThisMonth)} />
      </div>
    </div>
  );
}
