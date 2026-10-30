import { api } from "@/server/http";
import { notFound } from "@/server/lib/errors";
import { getJob } from "@/server/services/public-contract";

export const GET = api<{ params: Promise<{ jobId: string }> }>(
  async (_req, ctx, repo) => {
    const { jobId } = await ctx.params;
    const job = await getJob(repo, jobId);
    if (!job) throw notFound("Trabajo no encontrado");
    return job;
  },
  { key: "jobs-get" },
);
