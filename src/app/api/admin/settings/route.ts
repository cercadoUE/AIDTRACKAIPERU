import { z } from "zod";
import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { badRequest } from "@/server/lib/errors";
import { nowIso } from "@/server/lib/ids";
import { audit } from "@/server/services/common";

const w = z.number().min(0).max(100);
export const PUT = api(async (req, _c, repo) => {
  const actor = await requireRole(req, "admin");
  const b = await body(req, z.object({ weights: z.object({ deficit: w, autonomy: w, severity: w, vulnerability: w, logistics: w }), targetDays: z.number().min(1).max(14) }));
  if (Object.values(b.weights).reduce((a, x) => a + x, 0) <= 0) throw badRequest("Al menos un peso debe ser mayor que 0");
  const at = nowIso();
  await repo.put("settings", { id: "settings", createdAt: at, updatedAt: at, ...b });
  await audit(repo, actor.id, "settings.update", "settings", "settings", b);
  return { ok: true };
});
