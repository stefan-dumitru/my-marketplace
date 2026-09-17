import { notFound } from "next/navigation";
import { listActiveCategories } from "@/server/data/categories";
import { getProductForSellerEdit } from "@/server/services/product-service";
import { getSellerContext } from "@/server/services/seller-service";
import { ProductForm } from "@/components/seller/ProductForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  // Non-null: the (seller) layout already redirected away any non-approved seller.
  const context = await getSellerContext();
  const profile = context!.profile!;

  const [product, categories] = await Promise.all([
    getProductForSellerEdit(profile.id, id),
    listActiveCategories(),
  ]);
  // Hides the row the same way getProductForStorefront hides a non-visible product — doesn't
  // exist or isn't owned by this seller are treated identically.
  if (!product) notFound();

  const variant = product.variants[0];

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit product</h1>
      <ProductForm
        mode="edit"
        categories={categories}
        initialValues={{
          id: product.id,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description ?? "",
          brand: product.brand ?? "",
          sku: product.sku,
          imageUrl: product.images[0] ?? "",
          price: variant ? variant.price.toString() : "0",
          stockQty: variant ? variant.stockQty.toString() : "0",
        }}
      />
    </div>
  );
}
