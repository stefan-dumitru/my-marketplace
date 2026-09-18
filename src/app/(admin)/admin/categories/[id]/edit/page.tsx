import { notFound } from "next/navigation";
import { getCategoriesForAdmin, getCategoryForAdmin } from "@/server/services/category-service";
import { CategoryForm } from "@/components/admin/CategoryForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCategoryPage({ params }: Props) {
  const { id } = await params;

  const [category, categories] = await Promise.all([
    getCategoryForAdmin(id),
    getCategoriesForAdmin(),
  ]);
  if (!category) notFound();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit category</h1>
      <CategoryForm
        mode="edit"
        categories={categories}
        initialValues={{
          id: category.id,
          name: category.name,
          parentId: category.parentId ?? "",
          imageUrl: category.imageUrl ?? "",
          isActive: category.isActive,
          defaultCommissionRate: category.defaultCommissionRate.toString(),
        }}
      />
    </div>
  );
}
