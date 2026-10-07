import { requireAdminPage } from "@/lib/page-guards";
import { notFound } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAdminSupportThread } from "@/server/services/support-service";
import { SupportThread } from "@/components/admin/SupportThread";

type Props = { params: Promise<{ id: string }> };

export default async function AdminSupportThreadPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const thread = await getAdminSupportThread(id);
  if (!thread) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{thread.conversation.user.name}</h1>
          <p className="text-sm text-muted-foreground">{thread.conversation.user.email}</p>
        </div>
        <Link href="/admin/support" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to inbox
        </Link>
      </div>
      <SupportThread
        conversationId={id}
        initialStatus={thread.conversation.status}
        initialMessages={thread.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
    </div>
  );
}
