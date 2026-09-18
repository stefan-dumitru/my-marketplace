import Link from "next/link";
import { getCategoriesForAdmin } from "@/server/services/category-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function AdminCategoriesPage() {
  const categories = await getCategoriesForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Link href="/admin/categories/new" className={buttonVariants()}>
          New category
        </Link>
      </div>

      {categories.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No categories yet.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((category) => (
            <Link key={category.id} href={`/admin/categories/${category.id}/edit`}>
              <Card className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-muted-foreground">
                    /{category.slug}
                    {category.parent && ` · under ${category.parent.name}`}
                    {!category.isActive && " · inactive"}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {(Number(category.defaultCommissionRate) * 100).toFixed(1)}% commission
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
