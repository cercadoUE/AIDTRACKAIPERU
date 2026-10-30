import { api } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { productLabel } from "@/server/domain/catalog";

/** Admin y logística ven todas; el coordinador solo las de su albergue. */
export const GET = api(async (req, _c, repo) => {
  const actor = await requireActor(req);
  if (actor.role === "donor") return { needs: [], shelters: [] };
  const shelters = await repo.list("shelters");
  const all = await repo.list("needs");
  const needs = actor.role === "shelter_coordinator" ? all.filter((n) => n.shelterId === actor.shelterId) : all;
  const byId = new Map(shelters.map((s) => [s.id, s]));
  return {
    needs: needs.map((n) => ({ ...n, productLabel: productLabel(n.product), shelterName: byId.get(n.shelterId)?.name, department: byId.get(n.shelterId)?.department, simulated: n.is_simulated })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    shelters: actor.role === "shelter_coordinator" ? shelters.filter((s) => s.id === actor.shelterId).map((s) => ({ id: s.id, name: s.name })) : shelters.map((s) => ({ id: s.id, name: s.name })),
  };
});
