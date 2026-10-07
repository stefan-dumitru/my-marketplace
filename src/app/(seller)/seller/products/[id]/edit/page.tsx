import { requireApprovedSellerPage } from "@/lib/page-guards";
import { parseSpecifications } from "@/lib/product-specs";
import { notFound } from "next/navigation";
import { listActiveCategories } from "@/server/data/categories";
import { getProductForSellerEdit } from "@/server/services/product-service";
import { ProductForm } from "@/components/seller/ProductForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const { profile } = await requireApprovedSellerPage();

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
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initialValues={{
          id: product.id,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description ?? "",
          brand: product.brand ?? "",
          sku: product.sku,
          images: product.images,
          price: variant ? variant.price.toString() : "0",
          stockQty: variant ? variant.stockQty.toString() : "0",
          specifications: parseSpecifications(product.specifications),
        }}
      />
    </div>
  );
}
