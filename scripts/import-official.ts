/**
 * Importa UBIGEO (INEI) y SINPAD (INDECI) desde data/raw hacia el repositorio configurado.
 * Uso: npm run etl   (STORAGE=file por defecto; STORAGE=dynamo DYNAMO_TABLE=... para AWS)
 */
import fs from "node:fs";
import path from "node:path";
import { createRepository } from "../src/server/container";
import { importUbigeo } from "../src/server/etl/ubigeo";
import { importSinpad } from "../src/server/etl/sinpad";

async function main() {
  const repo = createRepository();
  const raw = path.join(process.cwd(), "data", "raw");
  const ubi = path.join(raw, "ubigeo", "UBIGEOS_2022_1891_distritos.csv");
  const sin = path.join(raw, "BD_2003-2025_EMERGENCIAS.csv");
  const reports: Record<string, unknown> = {};
  if (fs.existsSync(ubi)) reports.ubigeo = await importUbigeo(repo, fs.readFileSync(ubi), { fileName: path.basename(ubi) });
  else console.warn(`Falta ${ubi}`);
  if (fs.existsSync(sin)) reports.sinpad = await importSinpad(repo, fs.readFileSync(sin), { fileName: path.basename(sin) });
  else console.warn(`Falta ${sin}`);
  fs.mkdirSync(path.join(process.cwd(), "data", "local"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "data", "local", "etl-report.json"), JSON.stringify(reports, null, 2));
  for (const [k, r] of Object.entries(reports)) {
    const x = r as { totalRows: number; accepted: number; rejected: number; duplicates: number; encoding: string; delimiter: string; summary: unknown };
    console.log(`${k}: filas=${x.totalRows} aceptadas=${x.accepted} rechazadas=${x.rejected} duplicadas=${x.duplicates} codificación=${x.encoding} delimitador=${JSON.stringify(x.delimiter)}`, x.summary);
  }
  (repo as { flush?: () => void }).flush?.();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
