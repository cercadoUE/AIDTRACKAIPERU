import { api, body } from "@/server/http";
import { createJob, jobInput } from "@/server/services/public-contract";

/** Insignia "Asíncrono": responde 202 de inmediato; el resultado queda listo unos segundos después. */
export const POST = api(
  async (req, _c, repo) => {
    const { input } = await body(req, jobInput);
    return Response.json(await createJob(repo, input), { status: 202 });
  },
  { limit: [60, 60_000], key: "jobs-create" },
);
