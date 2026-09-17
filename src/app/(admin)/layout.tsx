import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/admin/sellers");
  if (session.user.role !== "admin") redirect("/");

  return <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">{children}</div>;
}
