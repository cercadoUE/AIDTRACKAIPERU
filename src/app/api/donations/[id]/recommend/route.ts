import { api } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { recommend } from "@/server/services/donations";
import { forbidden, notFound } from "@/server/lib/errors";
import { productLabel } from "@/server/domain/catalog";

/** Donante dueño, logística y admin pueden calcular recomendaciones. Es solo una propuesta: no reserva stock. */
export const POST = api<{ params: Promise<{ id: string }> }>(
  async (req, ctx, repo) => {
    const { id } = await ctx.params;
    const actor = await requireActor(req);
    if (actor.role === "shelter_coordinator") throw forbidden();
    const d = await repo.get("donations", id);
    if (!d) throw notFound("Donación no encontrada");
    const rec = await recommend(repo, actor, id);
    return { run: rec.run, excluded: rec.excluded, notes: rec.notes, allocations: rec.allocations.map((a) => ({ ...a, label: productLabel(a.product) })) };
  },
  { limit: [20, 60_000], key: "recommend" },
);
