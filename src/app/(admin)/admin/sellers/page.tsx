import { listPendingSellerApplications } from "@/server/data/seller-profiles";
import { getApprovedSellers, getSuspendedSellers } from "@/server/services/seller-service";
import { SellerApplicationRow } from "@/components/admin/SellerApplicationRow";
import { SellerOversightRow } from "@/components/admin/SellerOversightRow";
import { Card } from "@/components/ui/card";

export default async function AdminSellersPage() {
  const [applications, approvedSellers, suspendedSellers] = await Promise.all([
    listPendingSellerApplications(),
    getApprovedSellers(),
    getSuspendedSellers(),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Pending seller applications</h1>

        {applications.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No pending applications.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {applications.map((application) => (
              <SellerApplicationRow key={application.id} application={application} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Approved sellers</h2>

        {approvedSellers.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No approved sellers yet.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {approvedSellers.map((seller) => (
              <SellerOversightRow key={seller.id} seller={seller} variant="approved" />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Suspended sellers</h2>

        {suspendedSellers.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No suspended sellers.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {suspendedSellers.map((seller) => (
              <SellerOversightRow key={seller.id} seller={seller} variant="suspended" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
