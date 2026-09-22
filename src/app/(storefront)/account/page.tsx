import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUserById } from "@/server/data/users";
import { getBuyerOrderStats, getRecentOrdersForBuyer } from "@/server/data/orders";
import { getAddressesForAccount } from "@/server/services/address-service";
import { getUnreadCount } from "@/server/services/notification-service";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/dashboard/StatTile";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { formatPrice } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  payment_failed: "Payment failed",
};

const AVATAR_COLORS = [
  "bg-red-100 text-red-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Deterministic per-user color, not random — same person always gets the same avatar color
// across visits/devices, matching how a real avatar would behave.
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect("/auth/login?callbackUrl=/account");

  // phone/createdAt aren't part of the JWT/session (see next-auth.d.ts) — fetched fresh here
  // rather than added to the token for a couple of rarely-changing fields nobody else needs on
  // every request.
  const [user, orderStats, recentOrders, addresses, unreadCount] = await Promise.all([
    getUserById(session.user.id),
    getBuyerOrderStats(session.user.id),
    getRecentOrdersForBuyer(session.user.id, 3),
    getAddressesForAccount(session.user.id),
    getUnreadCount(session.user.id),
  ]);

  const name = session.user.name ?? "there";
  const memberSince = user
    ? new Date(user.createdAt).toLocaleDateString("ro-RO", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${avatarColor(session.user.email ?? name)}`}
        >
          {initials(name)}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, {name}</h1>
          {memberSince && <p className="text-sm text-muted-foreground">Member since {memberSince}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Orders" value={orderStats.orderCount} />
        <StatTile label="Total spent" value={formatPrice(orderStats.totalSpent)} />
        <StatTile label="Saved addresses" value={addresses.length} />
        <StatTile label="Unread notifications" value={unreadCount} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent orders</h2>
          <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            View all
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("ro-RO")} ·{" "}
                      {STATUS_LABEL[order.status] ?? order.status}
                    </p>
                  </div>
                  <p className="font-medium">{formatPrice(order.totalAmount)}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Account details</h2>
        <Card className="flex flex-col gap-2 p-6 text-sm">
          <Row label="Name" value={session.user.name ?? "—"} />
          <Row label="Email" value={session.user.email ?? "—"} />
          <Row label="Phone" value={user?.phone ?? "—"} />
          <Row label="Role" value={session.user.role} />
          <Row
            label="Email verified"
            value={session.user.emailVerifiedAt ? "Yes" : "No — required before checkout"}
          />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/orders" className={buttonVariants({ variant: "outline" })}>
          My orders
        </Link>
        <Link href="/account/addresses" className={buttonVariants({ variant: "outline" })}>
          Manage addresses
        </Link>
      </div>
      <LogoutButton />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
