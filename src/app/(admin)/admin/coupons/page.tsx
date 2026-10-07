import { requireAdminPage } from "@/lib/page-guards";
import Link from "next/link";
import { getCouponsForAdmin } from "@/server/services/coupon-service";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { formatPrice } from "@/lib/format";
import { setCouponActiveAction } from "./actions";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

function describeValue(coupon: { type: string; value: unknown }) {
  return coupon.type === "percentage" ? `${Number(coupon.value)}% off` : `${formatPrice(coupon.value)} off`;
}

function statusOf(coupon: { isActive: boolean; startsAt: Date | null; expiresAt: Date | null }) {
  const now = new Date();
  if (!coupon.isActive) return "Inactive";
  if (coupon.expiresAt && coupon.expiresAt < now) return "Expired";
  if (coupon.startsAt && coupon.startsAt > now) return "Scheduled";
  return "Active";
}

export default async function AdminCouponsPage({ searchParams }: Props) {
  await requireAdminPage("/admin/coupons");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { coupons, hasNextPage } = await getCouponsForAdmin(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Coupons</h1>
        <Link href="/admin/coupons/new" className={buttonVariants()}>
          New coupon
        </Link>
      </div>

      {coupons.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No coupons yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(({ coupon, paidRedemptions, totalDiscountGiven }) => (
            <Card
              key={coupon.id}
              className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {coupon.code} <span className="font-normal text-muted-foreground">· {describeValue(coupon)}</span>
                </p>
                <p className="text-muted-foreground">
                  {statusOf(coupon)} · {paidRedemptions} paid use{paidRedemptions === 1 ? "" : "s"}
                  {coupon.maxRedemptionsTotal !== null && ` of ${coupon.maxRedemptionsTotal}`} ·{" "}
                  {formatPrice(totalDiscountGiven)} given
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/coupons/${coupon.id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Edit
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await setCouponActiveAction(coupon.id, !coupon.isActive);
                  }}
                >
                  <Button type="submit" variant="outline" size="sm">
                    {coupon.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} hasNextPage={hasNextPage} basePath="/admin/coupons" />
    </div>
  );
}
