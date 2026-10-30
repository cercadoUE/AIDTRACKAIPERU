import { api } from "@/server/http";
import { getActor } from "@/server/lib/auth";
import { ranking, type RankingMode } from "@/server/services/queries";

const MODES = new Set(["national", "department", "product", "deficit", "urgency"]);

export const GET = api(async (req, _c, repo) => {
  const actor = await getActor(req);
  const u = new URL(req.url);
  const mode = (MODES.has(u.searchParams.get("mode") ?? "") ? u.searchParams.get("mode") : "national") as RankingMode;
  const rows = await ranking(repo, actor, { mode, department: u.searchParams.get("department") ?? undefined, product: u.searchParams.get("product") ?? undefined });
  return { mode, rows };
});
