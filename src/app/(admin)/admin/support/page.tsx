import { requireAdminPage } from "@/lib/page-guards";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { parsePage } from "@/lib/pagination";
import { getAdminSupportInbox } from "@/server/services/support-service";

type Props = { searchParams: Promise<{ status?: string; page?: string }> };

export default async function AdminSupportPage({ searchParams }: Props) {
  await requireAdminPage("/admin/support");
  const params = await searchParams;
  const status = params.status === "closed" ? "closed" : "open";
  const page = parsePage(params.page);
  const { conversations, hasNextPage } = await getAdminSupportInbox({ status, page });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Support</h1>
        <div className="flex gap-2">
          <Link href="/admin/support" className={buttonVariants({ variant: status === "open" ? "default" : "outline", size: "sm" })}>
            Open
          </Link>
          <Link
            href="/admin/support?status=closed"
            className={buttonVariants({ variant: status === "closed" ? "default" : "outline", size: "sm" })}
          >
            Closed
          </Link>
        </div>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {status} conversations.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((c) => (
            <Link key={c.id} href={`/admin/support/${c.id}`}>
              <Card className="flex flex-col gap-1 p-4 text-sm hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {c.unread && <span className="mr-2 inline-block size-2 rounded-full bg-red-500" aria-label="Unread" />}
                    {c.userName} <span className="font-normal text-muted-foreground">· {c.userEmail}</span>
                  </p>
                  <p className="shrink-0 text-xs text-muted-foreground">{new Date(c.lastMessageAt).toLocaleString("ro-RO")}</p>
                </div>
                <p className="line-clamp-2 text-muted-foreground">{c.lastMessageBody}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        {page > 1 ? (
          <Link href={`/admin/support?status=${status}&page=${page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Previous
          </Link>
        ) : (
          <span />
        )}
        {hasNextPage && (
          <Link href={`/admin/support?status=${status}&page=${page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
