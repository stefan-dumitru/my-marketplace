import { listActiveCategories } from "@/server/data/categories";
import { ProductForm } from "@/components/seller/ProductForm";

export default async function NewProductPage() {
  const categories = await listActiveCategories();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Add a product</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
