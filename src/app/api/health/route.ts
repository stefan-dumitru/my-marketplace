import { prisma } from "@/lib/prisma";

// Unauthenticated by design — polled by load balancers/uptime monitors, not end users.
// Checks the DB is actually reachable, not just that the process is up, since a DB outage is the
// most likely real failure mode (operations.md > Observability).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
