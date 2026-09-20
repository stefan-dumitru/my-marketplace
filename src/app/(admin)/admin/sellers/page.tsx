import { listPendingSellerApplications } from "@/server/data/seller-profiles";
import { getApprovedSellers, getSuspendedSellers } from "@/server/services/seller-service";
import { SellerApplicationRow } from "@/components/admin/SellerApplicationRow";
import { SellerOversightRow } from "@/components/admin/SellerOversightRow";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { parsePage, splitPage } from "@/lib/pagination";

type Props = {
  searchParams: Promise<{ pendingPage?: string; approvedPage?: string; suspendedPage?: string }>;
};

export default async function AdminSellersPage({ searchParams }: Props) {
  const { pendingPage: pendingPageParam, approvedPage: approvedPageParam, suspendedPage: suspendedPageParam } =
    await searchParams;
  const pendingPage = parsePage(pendingPageParam);
  const approvedPage = parsePage(approvedPageParam);
  const suspendedPage = parsePage(suspendedPageParam);

  const [pendingRows, { sellers: approvedSellers, hasNextPage: approvedHasNextPage }, { sellers: suspendedSellers, hasNextPage: suspendedHasNextPage }] =
    await Promise.all([
      listPendingSellerApplications({ page: pendingPage }),
      getApprovedSellers(approvedPage),
      getSuspendedSellers(suspendedPage),
    ]);
  const { items: applications, hasNextPage: pendingHasNextPage } = splitPage(pendingRows);

  // Each list's Pagination carries the *other* two lists' current page in extraParams so
  // navigating one list doesn't reset the others back to page 1.
  const otherParams = {
    pendingPage: String(pendingPage),
    approvedPage: String(approvedPage),
    suspendedPage: String(suspendedPage),
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sellers</h1>
        <a href="/api/admin/reports/seller-performance" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Download seller performance CSV
        </a>
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Pending seller applications</h2>

        {applications.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No pending applications.</Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {applications.map((application) => (
                <SellerApplicationRow key={application.id} application={application} />
              ))}
            </div>
            <Pagination
              page={pendingPage}
              hasNextPage={pendingHasNextPage}
              basePath="/admin/sellers"
              paramName="pendingPage"
              extraParams={otherParams}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Approved sellers</h2>

        {approvedSellers.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No approved sellers yet.</Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {approvedSellers.map((seller) => (
                <SellerOversightRow key={seller.id} seller={seller} variant="approved" />
              ))}
            </div>
            <Pagination
              page={approvedPage}
              hasNextPage={approvedHasNextPage}
              basePath="/admin/sellers"
              paramName="approvedPage"
              extraParams={otherParams}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">Suspended sellers</h2>

        {suspendedSellers.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">No suspended sellers.</Card>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {suspendedSellers.map((seller) => (
                <SellerOversightRow key={seller.id} seller={seller} variant="suspended" />
              ))}
            </div>
            <Pagination
              page={suspendedPage}
              hasNextPage={suspendedHasNextPage}
              basePath="/admin/sellers"
              paramName="suspendedPage"
              extraParams={otherParams}
            />
          </>
        )}
      </div>
    </div>
  );
}
