import { api } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { getSettings } from "@/server/services/donations";

export const GET = api(async (req, _c, repo) => {
  await requireRole(req, "admin");
  const [users, shelters, audit, sources, settings, locations] = await Promise.all([
    repo.list("users"), repo.list("shelters", (s) => s.status === "pending" || s.status === "inactive" || s.status === "historical"), repo.list("audit"), repo.list("dataSources"), getSettings(repo), repo.list("locations"),
  ]);
  return {
    users: users.map(({ passwordHash, ...u }) => (void passwordHash, u)),
    pendingShelters: shelters.map((s) => ({ id: s.id, name: s.name, department: s.department, district: s.district, status: s.status, createdAt: s.createdAt, coordinatorId: s.coordinatorId })),
    audit: audit.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100),
    sources, settings, locationsCount: locations.length,
  };
});
