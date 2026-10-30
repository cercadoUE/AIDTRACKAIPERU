import { api } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { getItem } from "@/server/services/public-contract";

export const GET = api<{ params: Promise<{ id: string }> }>(
  async (_req, ctx, repo) => {
    const { id } = await ctx.params;
    const item = await getItem(repo, id);
    if (!item) throw notFound("Ítem no encontrado");
    return item;
  },
  { key: "items-get" },
);
