import Papa from "papaparse";

export interface CsvInspection {
  encoding: "utf-8" | "windows-1252";
  delimiter: string;
  columns: string[];
  rowCount: number;
  rows: Record<string, string>[];
}

/** Decodifica como UTF-8 estricto; si falla, usa windows-1252 (superconjunto práctico de ISO-8859-1). */
export function decodeBuffer(buf: Buffer | Uint8Array): { text: string; encoding: CsvInspection["encoding"] } {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(b), encoding: "windows-1252" };
  }
}

export function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const n = headerLine.split(c).length - 1;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

export function inspectCsv(buf: Buffer | Uint8Array): CsvInspection {
  const { text, encoding } = decodeBuffer(buf);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/\s+/g, " ").trim(),
  });
  return { encoding, delimiter, columns: parsed.meta.fields ?? [], rowCount: parsed.data.length, rows: parsed.data };
}

export interface ImportReport {
  source: string;
  encoding: string;
  delimiter: string;
  columns: string[];
  totalRows: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
  errorsTruncated: boolean;
  quality: { column: string; empty: number }[];
  summary: Record<string, number | string>;
}

export const MAX_ERRORS_LOGGED = 200;
