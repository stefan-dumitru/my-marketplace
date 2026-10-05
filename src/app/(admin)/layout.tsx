import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { getAdminUnreadCount } from "@/server/services/support-service";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/sellers");
  if (session.user.role !== "admin") redirect("/");
  const unreadSupport = await getAdminUnreadCount();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <nav className="flex flex-wrap gap-2">
        <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Dashboard
        </Link>
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
        <Link href="/admin/coupons" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Coupons
        </Link>
        <Link href="/admin/payouts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Payouts
        </Link>
        <Link href="/admin/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Reports
        </Link>
        <Link href="/admin/carrier-settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Carrier
        </Link>
        <Link href="/admin/support" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Support{unreadSupport > 0 ? ` (${unreadSupport})` : ""}
        </Link>
        <Link href="/admin/audit-log" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Audit Log
        </Link>
      </nav>
      {children}
    </main>
  );
}
