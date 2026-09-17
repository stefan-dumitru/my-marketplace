import { listPendingSellerApplications } from "@/server/data/seller-profiles";
import { SellerApplicationRow } from "@/components/admin/SellerApplicationRow";
import { Card } from "@/components/ui/card";

export default async function AdminSellersPage() {
  const applications = await listPendingSellerApplications();

  return (
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
  );
}
