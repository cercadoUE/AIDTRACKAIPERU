import { z } from "zod";
import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { confirmNeedQuantity, setNeedStatus } from "@/server/services/shelters";

export const PATCH = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const b = await body(req, z.object({ status: z.enum(["validated", "closed", "draft", "pending"]).optional(), quantity: z.number().positive().max(1_000_000).optional() }));
  if (b.quantity !== undefined) return { need: await confirmNeedQuantity(repo, actor, id, b.quantity) };
  if (b.status) return { need: await setNeedStatus(repo, actor, id, b.status) };
  return { need: null };
});
