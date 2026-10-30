import { z } from "zod";
import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { verifyShelter } from "@/server/services/shelters";

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireRole(req, "admin");
  const { decision } = await body(req, z.object({ decision: z.enum(["verify", "reject", "deactivate", "historical"]) }));
  return { shelter: await verifyShelter(repo, actor, id, decision) };
});
