import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductForSellerEdit } from "@/server/services/product-service";
import { getVariantsForSellerProduct } from "@/server/services/product-variant-service";
import { getSellerContext } from "@/server/services/seller-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { VariantRow } from "@/components/seller/VariantRow";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProductVariantsPage({ params }: Props) {
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const { id } = await params;
  const [product, variants] = await Promise.all([
    getProductForSellerEdit(profile.id, id),
    getVariantsForSellerProduct(profile.id, id),
  ]);
  if (!product || !variants) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Variants</h1>
          <p className="text-sm text-muted-foreground">{product.name}</p>
        </div>
        <Link href={`/seller/products/${id}/variants/new`} className={buttonVariants()}>
          Add variant
        </Link>
      </div>

      {variants.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No variants yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {variants.map((variant) => (
            <VariantRow key={variant.id} productId={id} variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
}
