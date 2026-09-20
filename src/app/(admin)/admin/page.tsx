import { getAdminDashboard } from "@/server/services/dashboard-service";
import { StatTile } from "@/components/dashboard/StatTile";
import { formatPrice } from "@/lib/format";

export default async function AdminHomePage() {
  const stats = await getAdminDashboard();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="GMV this month" value={formatPrice(stats.gmvThisMonth)} />
        <StatTile label="Active sellers" value={stats.activeSellers} />
        <StatTile label="Pending approvals" value={stats.pendingSellerApprovals} />
        <StatTile label="Orders today" value={stats.ordersToday} />
        <StatTile label="Flagged reviews" value={stats.pendingReviews} />
      </div>
    </div>
  );
}
