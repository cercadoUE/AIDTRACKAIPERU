import { api } from "@/server/http";
import { getActor } from "@/server/lib/auth";
import { mapData } from "@/server/services/queries";

export const GET = api(async (req, _c, repo) => mapData(repo, await getActor(req)));
