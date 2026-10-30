import { api, baseUrl } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { forbidden, notFound } from "@/server/lib/errors";
import { qrFor, timeline, publicShipment } from "@/server/services/shipments";
import { productLabel } from "@/server/domain/catalog";

export const GET = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const d = (await repo.get("donations", id)) ?? (await repo.list("donations", (x) => x.folio === id))[0];
  if (!d) throw notFound("Donación no encontrada");
  const allocations = await repo.list("allocations", (a) => a.donationId === d.id);
  const allowed =
    actor.role === "admin" || actor.role === "logistics" || d.donorId === actor.id ||
    (actor.role === "shelter_coordinator" && allocations.some((a) => a.shelterId === actor.shelterId));
  if (!allowed) throw forbidden("No tienes acceso a esta donación");
  const [items, shelters, tl] = await Promise.all([repo.list("donationItems", (i) => i.donationId === d.id), repo.list("shelters"), timeline(repo, d)]);
  const byShelter = new Map(shelters.map((s) => [s.id, s]));
  const base = baseUrl(req);
  const shipments = await Promise.all(tl.shipments.map(async (s) => ({
    ...publicShipment(s), shelterName: byShelter.get(s.shelterId)?.name,
    qr: actor.role === "donor" && d.donorId !== actor.id ? undefined : await qrFor(base, s),
  })));
  return {
    donation: d,
    items: items.map((i) => ({ ...i, label: productLabel(i.product) })),
    allocations: allocations.filter((a) => a.status !== "rejected").map((a) => ({ ...a, shelterName: byShelter.get(a.shelterId)?.name, department: byShelter.get(a.shelterId)?.department, simulated: byShelter.get(a.shelterId)?.is_simulated, label: productLabel(a.product) })),
    shipments, events: tl.events,
    canApprove: actor.role === "logistics" || actor.role === "admin",
  };
});
