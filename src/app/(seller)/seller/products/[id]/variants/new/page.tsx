import { notFound } from "next/navigation";
import { getProductForSellerEdit } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";
import { VariantForm } from "@/components/seller/VariantForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function NewVariantPage({ params }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const { id } = await params;
  const product = await getProductForSellerEdit(profile.id, id);
  if (!product) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Add variant</h1>
        <p className="text-sm text-muted-foreground">{product.name}</p>
      </div>
      <VariantForm productId={id} />
    </div>
  );
}
