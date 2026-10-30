import { z } from "zod";
import { api, body } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { parseDonation } from "@/server/ai/provider";
import { resolveDepartment } from "@/server/services/geo";

export const POST = api(
  async (req, _c, repo) => {
    await requireActor(req);
    const { text } = await body(req, z.object({ text: z.string().min(3).max(1500) }));
    const result = await parseDonation(text);
    // Si la IA devolvió una ciudad/provincia, se resuelve su departamento con el catálogo UBIGEO.
    if (!result.departmentCode && result.location) {
      const d = await resolveDepartment(repo, result.location);
      if (d) result.departmentCode = d.code;
    }
    return { result };
  },
  { limit: [15, 60_000], key: "ai-donation" },
);
