import { z } from "zod";
import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { advanceShipment } from "@/server/services/shipments";

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const { to, notes } = await body(req, z.object({ to: z.enum(["prepared", "dispatched", "in_transit", "delivered"]), notes: z.string().max(300).optional() }));
  return { shipment: await advanceShipment(repo, actor, id, to, notes) };
});
