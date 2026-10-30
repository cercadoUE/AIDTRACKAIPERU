import { api, body } from "@/server/http";
import { getActor, requireActor, canSeeContacts } from "@/server/lib/auth";
import { shelterPatch } from "@/server/domain/schemas";
import { updateShelter, sanitizeShelter } from "@/server/services/shelters";
import { shelterViews } from "@/server/services/queries";
import { notFound } from "@/server/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api<Ctx>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await getActor(req);
  const view = (await shelterViews(repo, actor, { includeInactive: true })).find((v) => v.shelter.id === id);
  if (!view) throw notFound("Albergue no encontrado");
  const allocations = await repo.list("allocations", (a) => a.shelterId === id && (a.status === "approved" || a.status === "proposed"));
  const donations = await repo.list("donations");
  const received = allocations.filter((a) => a.status === "approved").map((a) => ({ ...a, donationFolio: donations.find((d) => d.id === a.donationId)?.folio }));
  const history = canSeeContacts(actor, id) ? (await repo.list("shelterHistory", (h) => h.shelterId === id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) : [];
  return {
    shelter: view.shelter, priority: view.priority, inventory: view.inventory, needs: view.needs, received, history,
    canEdit: !!actor && (actor.role === "admin" || (actor.role === "shelter_coordinator" && actor.shelterId === id)),
  };
});

export const PATCH = api<Ctx>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const patch = await body(req, shelterPatch);
  const s = await updateShelter(repo, actor, id, patch);
  return { shelter: sanitizeShelter(s, actor) };
});
