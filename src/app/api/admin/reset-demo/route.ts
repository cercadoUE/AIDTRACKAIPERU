import { api } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { seedDemo } from "@/server/seed/seed";
import { HttpError } from "@/server/lib/errors";

/** Reinicia SOLO los datos de demostración. Los datos oficiales importados (UBIGEO, SINPAD) se conservan. */
export const POST = api(
  async (req, _c, repo) => {
    if (process.env.ALLOW_DEMO_RESET === "0") throw new HttpError(403, "El reinicio de la demo está deshabilitado en este entorno", "disabled");
    await requireRole(req, "admin");
    return { ok: true, ...(await seedDemo(repo)) };
  },
  { limit: [3, 60_000], key: "reset" },
);
