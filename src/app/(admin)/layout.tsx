import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/sellers");
  if (session.user.role !== "admin") redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <nav className="flex gap-2">
        <Link href="/admin/sellers" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Sellers
        </Link>
        <Link href="/admin/reviews" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Reviews
        </Link>
        <Link href="/admin/products" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Products
        </Link>
        <Link href="/admin/categories" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Categories
        </Link>
      </nav>
      {children}
    </div>
  );
}
