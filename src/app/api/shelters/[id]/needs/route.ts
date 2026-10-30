import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { needsSubmission } from "@/server/domain/schemas";
import { submitNeeds } from "@/server/services/shelters";

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, ctx, repo) => {
  const { id } = await ctx.params;
  const actor = await requireActor(req);
  const input = await body(req, needsSubmission);
  const needs = await submitNeeds(repo, actor, id, input.needs, { occupants: input.occupants });
  return Response.json({ needs }, { status: 201 });
});
