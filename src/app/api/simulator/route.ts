import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { scenarioInput, simulate } from "@/server/services/simulator";
import { badRequest } from "@/server/lib/errors";

export const POST = api(
  async (req, _c, repo) => {
    await requireRole(req, "logistics", "admin");
    const input = await body(req, scenarioInput);
    try {
      return await simulate(repo, input);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  },
  { limit: [10, 60_000], key: "simulate" },
);
