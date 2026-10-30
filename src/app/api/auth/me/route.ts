import { api } from "@/server/http";
import { getActor } from "@/server/lib/auth";

export const GET = api(async (req) => ({ user: await getActor(req) }));
