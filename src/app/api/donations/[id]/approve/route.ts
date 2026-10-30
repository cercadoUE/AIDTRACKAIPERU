import { z } from "zod";
import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { approveAllocations } from "@/server/services/donations";
import { createShipments } from "@/server/services/shipments";

/** Solo coordinación logística (o admin) aprueba; al aprobar se crean los envíos y se devuelve el código UNA vez. */
export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireRole(req, "logistics", "admin");
  const { allocationIds } = await body(req, z.object({ allocationIds: z.array(z.string()).max(100).optional() }));
  const approved = await approveAllocations(repo, actor, id, allocationIds);
  const shipments = await createShipments(repo, actor, id);
  return { approved, shipments: shipments.map((s) => ({ id: s.shipment.id, code: s.shipment.code, shelterId: s.shipment.shelterId, confirmationCode: s.confirmationCode })) };
});
