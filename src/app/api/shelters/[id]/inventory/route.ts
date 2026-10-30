import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { inventoryInput } from "@/server/domain/schemas";
import { setInventory } from "@/server/services/shelters";

export const PUT = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const i = await body(req, inventoryInput);
  return { item: await setInventory(repo, actor, id, i.product, i.quantity, i.unit) };
});
