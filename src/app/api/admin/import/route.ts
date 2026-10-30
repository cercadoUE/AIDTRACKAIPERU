import { api } from "@/server/http";
import { requireRole } from "@/server/lib/auth";
import { badRequest } from "@/server/lib/errors";
import { importSinpad } from "@/server/etl/sinpad";
import { importUbigeo } from "@/server/etl/ubigeo";
import { audit } from "@/server/services/common";

const MAX_BYTES = 40 * 1024 * 1024;

/** Importa un CSV oficial. Parámetros: ?kind=ubigeo|sinpad&dryRun=1. Solo administradores. */
export const POST = api(
  async (req, _c, repo) => {
    const actor = await requireRole(req, "admin");
    const u = new URL(req.url);
    const kind = u.searchParams.get("kind");
    if (kind !== "ubigeo" && kind !== "sinpad") throw badRequest("kind debe ser ubigeo o sinpad");
    const dryRun = u.searchParams.get("dryRun") === "1";
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > MAX_BYTES) throw badRequest("El archivo supera 40 MB");
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) throw badRequest("Archivo vacío");
    if (buf.length > MAX_BYTES) throw badRequest("El archivo supera 40 MB");
    try {
      const report = kind === "ubigeo" ? await importUbigeo(repo, buf, { persist: !dryRun }) : await importSinpad(repo, buf, { persist: !dryRun });
      if (!dryRun) await audit(repo, actor.id, `import.${kind}`, "dataSource", kind, { accepted: report.accepted, rejected: report.rejected });
      return { dryRun, report };
    } catch (e) {
      throw badRequest((e as Error).message);
    }
  },
  { limit: [5, 60_000], key: "import" },
);
