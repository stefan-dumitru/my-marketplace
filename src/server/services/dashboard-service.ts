import "server-only";
import { getAdminDashboardStats } from "@/server/data/dashboard";

export function getAdminDashboard() {
  return getAdminDashboardStats();
}
