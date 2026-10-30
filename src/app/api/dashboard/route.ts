import { api } from "@/server/http";
import { getActor } from "@/server/lib/auth";
import { dashboard } from "@/server/services/queries";

export const GET = api(async (req, _c, repo) => dashboard(repo, await getActor(req)));
