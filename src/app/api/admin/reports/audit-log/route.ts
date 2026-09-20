import { requireAdminForRoute } from "@/lib/route-auth";
import { getAuditLogExportRows } from "@/server/services/report-service";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const ctx = await requireAdminForRoute();
  if (ctx instanceof Response) return ctx;

  const rows = await getAuditLogExportRows();

  const csv = toCsv(
    rows.map((r) => ({
      timestamp: r.createdAt.toISOString(),
      actorName: r.actor?.name ?? "System",
      actorEmail: r.actor?.email ?? "",
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      beforeValue: r.beforeValue ? JSON.stringify(r.beforeValue) : "",
      afterValue: r.afterValue ? JSON.stringify(r.afterValue) : "",
    })),
    [
      { key: "timestamp", header: "Timestamp" },
      { key: "actorName", header: "Actor Name" },
      { key: "actorEmail", header: "Actor Email" },
      { key: "action", header: "Action" },
      { key: "entityType", header: "Entity Type" },
      { key: "entityId", header: "Entity ID" },
      { key: "beforeValue", header: "Before Value" },
      { key: "afterValue", header: "After Value" },
    ]
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log.csv"`,
    },
  });
}
