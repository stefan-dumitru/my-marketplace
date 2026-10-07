import { requireAdminPage } from "@/lib/page-guards";
import { CouponForm } from "@/components/admin/CouponForm";

export default async function NewCouponPage() {
  await requireAdminPage("/admin/coupons/new");
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">New coupon</h1>
      <p className="text-sm text-muted-foreground">
        Coupons are funded by the platform: sellers&apos; payouts are unaffected, and the discount comes out
        of your margin.
      </p>
      <CouponForm />
    </div>
  );
}
