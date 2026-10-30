import type { Repository } from "../ports/repository";
import type { GeographicLocation } from "../domain/types";
import { DEPT_BY_CODE, normalizeName } from "../domain/catalog";
import { nowIso } from "../lib/ids";
import { inspectCsv, MAX_ERRORS_LOGGED, type ImportReport } from "./csv";

export const UBIGEO_URL = "https://www.datosabiertos.gob.pe/dataset/ubigeos-c%C3%B3digos-de-ubicaci%C3%B3n-geogr%C3%A1fica-instituto-nacional-de-estad%C3%ADstica-e-inform%C3%A1tica-inei";
export const UBIGEO_NAME = "INEI - UBIGEO 2022 (1891 distritos)";
export const UBIGEO_SOURCE_TAG = "INEI UBIGEO";

/** Importa el catálogo territorial oficial. Idempotente por id determinístico `geo_<ubigeo>`. */
export async function importUbigeo(repo: Repository, buf: Buffer | Uint8Array, opts: { persist?: boolean; fileName?: string } = {}): Promise<ImportReport> {
  const csv = inspectCsv(buf);
  const find = (...names: string[]) => csv.columns.find((c) => names.includes(c.toUpperCase().replace(/\s+/g, "")));
  const cId = find("IDDIST", "UBIGEO", "CODIGO");
  const cDep = find("NOMBDEP", "DEPARTAMENTO");
  const cProv = find("NOMBPROV", "PROVINCIA");
  const cDist = find("NOMBDIST", "DISTRITO");
  if (!cId || !cDep || !cProv || !cDist) throw new Error(`Columnas UBIGEO no reconocidas. Se esperaba IDDIST, NOMBDEP, NOMBPROV, NOMBDIST; llegaron: ${csv.columns.join(", ")}`);

  const errors: ImportReport["errors"] = [];
  const seen = new Set<string>();
  const out: GeographicLocation[] = [];
  let rejected = 0;
  let duplicates = 0;
  const at = nowIso();
  const addError = (row: number, reason: string) => {
    rejected++;
    if (errors.length < MAX_ERRORS_LOGGED) errors.push({ row, reason });
  };
  csv.rows.forEach((r, i) => {
    const row = i + 2;
    const ubigeo = (r[cId] ?? "").trim().padStart(6, "0");
    if (!/^\d{6}$/.test(ubigeo)) return addError(row, `UBIGEO inválido: "${r[cId]}"`);
    if (seen.has(ubigeo)) {
      duplicates++;
      return;
    }
    const dept = DEPT_BY_CODE.get(ubigeo.slice(0, 2));
    if (!dept) return addError(row, `Código de departamento desconocido: ${ubigeo.slice(0, 2)}`);
    const province = normalizeName(r[cProv] ?? "");
    const district = normalizeName(r[cDist] ?? "");
    if (!province || !district) return addError(row, "Provincia o distrito vacío");
    seen.add(ubigeo);
    out.push({ id: `geo_${ubigeo}`, createdAt: at, updatedAt: at, source: UBIGEO_SOURCE_TAG, ubigeo, departmentCode: dept.code, department: dept.name, provinceCode: ubigeo.slice(0, 4), province, district });
  });

  if (opts.persist !== false) {
    for (const l of out) {
      const prev = await repo.get("locations", l.id);
      await repo.put("locations", prev ? { ...l, createdAt: prev.createdAt } : l);
    }
    await repo.put("dataSources", {
      id: "src_ubigeo", createdAt: at, updatedAt: at, name: UBIGEO_NAME, url: UBIGEO_URL, kind: "ubigeo",
      rows: csv.rowCount, accepted: out.length, rejected, report: { duplicates, file: opts.fileName, importedAt: at },
    });
  }
  return {
    source: UBIGEO_NAME, encoding: csv.encoding, delimiter: csv.delimiter, columns: csv.columns, totalRows: csv.rowCount,
    accepted: out.length, rejected, duplicates, errors, errorsTruncated: rejected > errors.length, quality: [],
    summary: { departments: new Set(out.map((l) => l.departmentCode)).size, provinces: new Set(out.map((l) => l.provinceCode)).size, districts: out.length },
  };
}
