import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { confirmReceiptInput } from "@/server/domain/schemas";
import { confirmReceipt } from "@/server/services/shipments";

// Límite estricto: evita adivinar el código de 6 dígitos.
export const POST = api<{ params: Promise<{ id: string }> }>(
  async (req, ctx, repo) => {
    const { id } = await ctx.params;
    const actor = await requireActor(req);
    const { code, notes } = await body(req, confirmReceiptInput);
    return { shipment: await confirmReceipt(repo, actor, id, code, notes) };
  },
  { limit: [5, 5 * 60_000], key: "confirm" },
);
