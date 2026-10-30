import { z } from "zod";
import { api, body } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { parseNeeds } from "@/server/ai/provider";

export const POST = api(
  async (req) => {
    await requireRole(req, "shelter_coordinator", "admin");
    const { text } = await body(req, z.object({ text: z.string().min(3).max(1500) }));
    return { result: await parseNeeds(text) };
  },
  { limit: [15, 60_000], key: "ai-need" },
);
