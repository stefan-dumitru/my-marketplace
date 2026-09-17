import { auth } from "@/lib/auth";
import { getCartItemCount } from "@/server/data/cart";
import { Header } from "@/components/layout/Header";

export default async function StorefrontLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  // Only queried when a session exists — guests pay nothing extra for this.
  const cartItemCount = session ? await getCartItemCount(session.user.id) : 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header user={session ? { role: session.user.role, cartItemCount } : null} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
