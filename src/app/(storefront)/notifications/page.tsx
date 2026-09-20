import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getNotifications } from "@/server/services/notification-service";
import { Card } from "@/components/ui/card";
import { cn } from "cn";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/notifications");

  // Marks everything below as read as a side effect — the `read` values captured here are each
  // row's state from just before that happened, so this one render still shows what was new.
  const notifications = await getNotifications(session.user.id);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Notifications</h1>

      {notifications.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          You don&apos;t have any notifications yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((notification) => {
            const row = (
              <Card
                className={cn(
                  "flex flex-col gap-1 border-l-4 p-4 text-sm",
                  notification.read ? "border-l-transparent" : "border-l-primary bg-accent/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{notification.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString("ro-RO")}
                  </p>
                </div>
                <p className="text-muted-foreground">{notification.body}</p>
              </Card>
            );
            return notification.link ? (
              <Link key={notification.id} href={notification.link}>
                {row}
              </Link>
            ) : (
              <div key={notification.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
