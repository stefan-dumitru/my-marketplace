import { auth } from "@/lib/auth";
import { getUserSupportChat, hasUnreadSupportReply } from "@/server/services/support-service";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const params = new URL(req.url).searchParams;
  const headers = { "Cache-Control": "no-store" };

  // Lightweight unread check for the closed widget — does not mark anything as read.
  if (params.get("peek") === "1") {
    return Response.json({ unread: await hasUnreadSupportReply(session.user.id) }, { headers });
  }

  const afterParam = params.get("after");
  const after = afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam) : undefined;
  return Response.json(await getUserSupportChat(session.user.id, after), { headers });
}
