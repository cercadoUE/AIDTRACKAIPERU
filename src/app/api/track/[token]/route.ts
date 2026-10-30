import { api } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { STATUS_LABEL } from "@/server/services/shipments";

/** Consulta pública de solo lectura asociada al QR. Nunca confirma ni modifica nada. */
export const GET = api<{ params: Promise<{ token: string }> }>(async (_req, ctx, repo) => {
  const { token } = await ctx.params;
  const s = (await repo.list("shipments", (x) => x.qrToken === token))[0];
  if (!s) throw notFound("Envío no encontrado");
  const [shelter, donation, events] = await Promise.all([repo.get("shelters", s.shelterId), repo.get("donations", s.donationId), repo.list("shipmentEvents", (e) => e.shipmentId === s.id)]);
  return {
    code: s.code, status: s.status, statusLabel: STATUS_LABEL[s.status], shelter: shelter?.name, department: shelter?.department, donation: donation?.folio,
    simulated: !!(shelter?.is_simulated || donation?.is_simulated),
    events: events.sort((a, b) => a.at.localeCompare(b.at)).map((e) => ({ at: e.at, action: e.action, to: STATUS_LABEL[e.to] ?? e.to })),
    notice: "Esta página solo muestra el estado. La recepción solo la confirma el coordinador del albergue con su sesión y el código de entrega.",
  };
}, { limit: [30, 60_000], key: "track" });
