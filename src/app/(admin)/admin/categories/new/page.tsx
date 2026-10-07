import { requireAdminPage } from "@/lib/page-guards";
import { getCategoriesForAdmin } from "@/server/services/category-service";
import { CategoryForm } from "@/components/admin/CategoryForm";

export default async function NewCategoryPage() {
  await requireAdminPage("/admin/categories/new");
  const categories = await getCategoriesForAdmin();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">New category</h1>
      <CategoryForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
