import type { Repository } from "../ports/repository";
import type { EmergencyStat, GeographicLocation } from "../domain/types";
import { DEPT_BY_CODE, normalizeName } from "../domain/catalog";
import { nowIso } from "../lib/ids";
import { inspectCsv, MAX_ERRORS_LOGGED, type ImportReport } from "./csv";

export const SINPAD_URL = "https://www.datosabiertos.gob.pe/dataset/emergencias-y-da%C3%B1os-nivel-nacional-por-departamento";
export const SINPAD_NAME = "SINPAD - INDECI: Emergencias y daños a nivel nacional";

const REQUIRED = ["CODIGO DE EMERGENCIA-SINPAD", "FECHA DE LA EMER", "COD. DISTRITO", "DPTO.", "PROV.", "DIST.", "PELIGRO", "FALLECIDOS", "DAMNIFICADOS", "AFECTADOS"];

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * El archivo mezcla dos formatos: dd/mm/aaaa (2003–2024) y mm/dd/aa (registros de 2025).
 * Se detecta por la longitud del año y se contrasta con la columna AÑO para evitar errores silenciosos.
 */
function parseDate(d: string, yearColumn: string): { year: number; normalized: boolean } | null {
  const long = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d.trim());
  const short = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(d.trim());
  let day: number, mon: number, year: number, normalized = false;
  if (long) {
    [day, mon, year] = [Number(long[1]), Number(long[2]), Number(long[3])];
  } else if (short) {
    [mon, day, year] = [Number(short[1]), Number(short[2]), 2000 + Number(short[3])];
    normalized = true;
  } else return null;
  const dt = new Date(Date.UTC(year, mon - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== day) return null;
  if (year < 1990 || year > new Date().getFullYear() + 1) return null;
  const col = yearColumn.trim();
  if (col && /^\d{4}$/.test(col) && Number(col) !== year) return null; // fecha y columna AÑO contradictorias
  return { year, normalized };
}

/**
 * Importa el CSV de emergencias SINPAD (INDECI). Idempotente: los ids son determinísticos
 * (departamento-año-peligro) y las estadísticas se recalculan completas, así que reimportar no duplica.
 * Los "damnificados" son un acumulado HISTÓRICO y nunca se usan como ocupación actual de un albergue.
 */
export async function importSinpad(repo: Repository, buf: Buffer | Uint8Array, opts: { persist?: boolean; fileName?: string } = {}): Promise<ImportReport> {
  const t0 = Date.now();
  const csv = inspectCsv(buf);
  const normHeaders = new Map(csv.columns.map((c) => [c.replace(/\s+/g, " ").trim().toUpperCase(), c]));
  const missing = REQUIRED.filter((r) => !normHeaders.has(r));
  if (missing.length) {
    throw new Error(`El archivo no parece SINPAD: faltan columnas ${missing.join(", ")}`);
  }
  const col = (name: string) => normHeaders.get(name)!;
  const hazardCol = col("PELIGRO");
  const yearColName = csv.columns.find((c) => normalizeName(c) === "ANO") ?? "";
  let normalizedDates = 0;

  const seen = new Set<string>();
  const errors: ImportReport["errors"] = [];
  let duplicates = 0;
  let accepted = 0;
  let rejected = 0;
  const stats = new Map<string, EmergencyStat>();
  const locations = new Map<string, GeographicLocation>();
  const empties = new Map<string, number>(csv.columns.map((c) => [c, 0]));
  const at = nowIso();
  const addError = (row: number, reason: string) => {
    rejected++;
    if (errors.length < MAX_ERRORS_LOGGED) errors.push({ row, reason });
  };

  csv.rows.forEach((r, idx) => {
    const rowNo = idx + 2;
    for (const c of csv.columns) if (!r[c] || r[c].trim() === "") empties.set(c, (empties.get(c) ?? 0) + 1);
    const code = (r[col("CODIGO DE EMERGENCIA-SINPAD")] ?? "").trim();
    if (!code) return addError(rowNo, "Sin código SINPAD");
    if (seen.has(code)) {
      duplicates++;
      return;
    }
    const ubigeo = (r[col("COD. DISTRITO")] ?? "").trim().padStart(6, "0");
    if (!/^\d{6}$/.test(ubigeo)) return addError(rowNo, `UBIGEO inválido: "${r[col("COD. DISTRITO")]}"`);
    const dept = DEPT_BY_CODE.get(ubigeo.slice(0, 2));
    if (!dept) return addError(rowNo, `Departamento desconocido por UBIGEO ${ubigeo}`);
    const yearValue = yearColName ? (r[yearColName] ?? "") : "";
    const date = parseDate(r[col("FECHA DE LA EMER")] ?? "", yearValue);
    if (!date) return addError(rowNo, `Fecha inválida o inconsistente con AÑO: "${r[col("FECHA DE LA EMER")]}" / "${yearValue}"`);
    if (date.normalized) normalizedDates++;
    const hazard = normalizeName(r[hazardCol] ?? "");
    if (!hazard) return addError(rowNo, "Sin tipo de peligro");
    const deceased = num(r[col("FALLECIDOS")]);
    const homeless = num(r[col("DAMNIFICADOS")]);
    const affected = num(r[col("AFECTADOS")]);
    if (deceased === null || homeless === null || affected === null) return addError(rowNo, "Valor numérico inválido o negativo en daños");

    seen.add(code);
    accepted++;
    const key = `${dept.code}-${date.year}-${hazard}`;
    const id = `stat_${key.replace(/[^A-Z0-9-]/g, "_")}`;
    const s = stats.get(id) ?? { id, createdAt: at, updatedAt: at, departmentCode: dept.code, department: dept.name, year: date.year, hazard, events: 0, deceased: 0, homeless: 0, affected: 0 };
    s.events += 1;
    s.deceased += deceased;
    s.homeless += homeless;
    s.affected += affected;
    stats.set(id, s);

    if (!locations.has(ubigeo)) {
      locations.set(ubigeo, {
        id: `geo_${ubigeo}`, createdAt: at, updatedAt: at, source: "SINPAD (derivado; el catálogo oficial es INEI)",
        ubigeo, departmentCode: dept.code, department: dept.name, provinceCode: ubigeo.slice(0, 4),
        province: normalizeName(r[col("PROV.")] ?? ""), district: normalizeName(r[col("DIST.")] ?? ""),
      });
    }
  });

  if (opts.persist !== false) {
    // Reemplazo completo de estadísticas: reimportar nunca duplica.
    for (const old of await repo.list("emergencyStats")) await repo.remove("emergencyStats", old.id);
    for (const s of stats.values()) await repo.put("emergencyStats", s);
    for (const l of locations.values()) {
      const existing = await repo.get("locations", l.id);
      // No pisar un registro oficial INEI con uno derivado de SINPAD.
      if (!existing || existing.source.startsWith("SINPAD")) await repo.put("locations", l);
    }
    await repo.put("dataSources", {
      id: "src_sinpad", createdAt: at, updatedAt: at, name: SINPAD_NAME, url: SINPAD_URL, kind: "sinpad",
      rows: csv.rowCount, accepted, rejected, report: { duplicates, file: opts.fileName, importedAt: at },
    });
  }

  return {
    source: SINPAD_NAME, encoding: csv.encoding, delimiter: csv.delimiter, columns: csv.columns, totalRows: csv.rowCount,
    accepted, rejected, duplicates, errors, errorsTruncated: rejected > errors.length,
    quality: [...empties].map(([column, empty]) => ({ column, empty })).filter((q) => q.empty > 0).sort((a, b) => b.empty - a.empty).slice(0, 15),
    summary: { statRecords: stats.size, districts: locations.size, fechasNormalizadas: normalizedDates, durationMs: Date.now() - t0 },
  };
}
