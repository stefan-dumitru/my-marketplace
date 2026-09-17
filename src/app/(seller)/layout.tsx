import { redirect } from "next/navigation";
import { getSellerContext } from "@/server/services/seller-service";

export default async function SellerLayout({ children }: LayoutProps<"/">) {
  const context = await getSellerContext();
  if (!context) redirect("/auth/login?callbackUrl=/seller");

  if (!context.profile || context.profile.status !== "approved") {
    redirect("/sell");
  }

  return <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">{children}</div>;
}
