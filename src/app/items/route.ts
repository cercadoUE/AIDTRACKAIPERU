import { api, body } from "@/server/http";
import { createItem, itemInput, listItems } from "@/server/services/public-contract";

/** Insignia "Persistencia": rutas públicas sobre la tabla DynamoDB de la app. */
export const POST = api(
  async (req, _c, repo) => {
    const { value } = await body(req, itemInput);
    return Response.json(await createItem(repo, value), { status: 201 });
  },
  { limit: [60, 60_000], key: "items-create" },
);

export const GET = api(async (_req, _c, repo) => ({ items: await listItems(repo) }), { key: "items-list" });
