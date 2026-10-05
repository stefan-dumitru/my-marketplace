import { requireAdminForRoute } from "@/lib/route-auth";
import { getAdminSupportThread } from "@/server/services/support-service";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminForRoute();
  if (ctx instanceof Response) return ctx;

  const { id } = await params;
  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam) : undefined;

  const thread = await getAdminSupportThread(id, after);
  if (!thread) return new Response("Not found", { status: 404 });
  return Response.json(
    { status: thread.conversation.status, messages: thread.messages },
    { headers: { "Cache-Control": "no-store" } }
  );
}
