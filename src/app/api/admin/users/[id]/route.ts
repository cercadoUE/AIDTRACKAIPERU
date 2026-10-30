import { z } from "zod";
import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { badRequest, notFound } from "@/server/lib/errors";
import { nowIso } from "@/server/lib/ids";
import { audit } from "@/server/services/common";

export const PATCH = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireRole(req, "admin");
  const b = await body(req, z.object({ role: z.enum(["donor", "shelter_coordinator", "logistics", "admin"]), shelterId: z.string().optional() }));
  const u = await repo.get("users", id);
  if (!u) throw notFound("Usuario no encontrado");
  if (u.id === actor.id && b.role !== "admin") throw badRequest("No puedes quitarte tu propio rol de administrador");
  if (b.role === "shelter_coordinator") {
    if (!b.shelterId || !(await repo.get("shelters", b.shelterId))) throw badRequest("Un coordinador necesita un albergue válido");
    u.shelterId = b.shelterId;
  } else u.shelterId = undefined;
  const before = u.role;
  u.role = b.role;
  u.updatedAt = nowIso();
  await repo.put("users", u);
  await audit(repo, actor.id, "user.role", "user", id, { from: before, to: b.role, shelterId: u.shelterId });
  return { ok: true };
});
