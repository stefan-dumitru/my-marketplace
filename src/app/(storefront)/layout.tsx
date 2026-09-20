import { auth } from "@/lib/auth";
import { getCartItemCount } from "@/server/data/cart";
import { getUnreadCount } from "@/server/services/notification-service";
import { Header } from "@/components/layout/Header";

export default async function StorefrontLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  // Only queried when a session exists — guests pay nothing extra for this.
  const [cartItemCount, unreadNotificationCount] = session
    ? await Promise.all([getCartItemCount(session.user.id), getUnreadCount(session.user.id)])
    : [0, 0];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header user={session ? { role: session.user.role, cartItemCount, unreadNotificationCount } : null} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
