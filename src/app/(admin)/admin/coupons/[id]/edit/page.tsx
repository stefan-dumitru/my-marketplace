import { notFound } from "next/navigation";
import { getCouponForAdminEdit } from "@/server/services/coupon-service";
import { CouponForm } from "@/components/admin/CouponForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCouponPage({ params }: Props) {
  const { id } = await params;
  const coupon = await getCouponForAdminEdit(id);
  if (!coupon) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit coupon</h1>
      <CouponForm mode="edit" couponId={coupon.id} redeemed={coupon.redeemed} initialValues={coupon.initialValues} />
    </div>
  );
}
