import { z } from "zod";
import { api, body } from "@/server/http";
import { getActor } from "@/server/lib/auth";
import { ask } from "@/server/ai/assistant";

export const POST = api(
  async (req, _c, repo) => {
    const actor = await getActor(req);
    const { question } = await body(req, z.object({ question: z.string().min(3).max(400) }));
    return ask(repo, actor, question);
  },
  { limit: [12, 60_000], key: "ai-assistant" },
);
