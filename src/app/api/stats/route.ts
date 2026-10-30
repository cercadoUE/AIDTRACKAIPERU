import { api } from "@/server/http";

/** Contexto histórico SINPAD por departamento. Son acumulados históricos, NO ocupación actual. */
export const GET = api(async (req, _c, repo) => {
  const dept = new URL(req.url).searchParams.get("department");
  const stats = await repo.list("emergencyStats", (s) => !dept || s.departmentCode === dept);
  const src = await repo.get("dataSources", "src_sinpad");
  const byYear = new Map<number, { events: number; affected: number; homeless: number; deceased: number }>();
  const byHazard = new Map<string, number>();
  for (const s of stats) {
    const y = byYear.get(s.year) ?? { events: 0, affected: 0, homeless: 0, deceased: 0 };
    y.events += s.events; y.affected += s.affected; y.homeless += s.homeless; y.deceased += s.deceased;
    byYear.set(s.year, y);
    byHazard.set(s.hazard, (byHazard.get(s.hazard) ?? 0) + s.events);
  }
  return {
    available: stats.length > 0,
    source: src ? { name: src.name, url: src.url, rows: src.rows, accepted: src.accepted, importedAt: src.updatedAt } : null,
    byYear: [...byYear].sort(([a], [b]) => a - b).map(([year, v]) => ({ year, ...v })),
    topHazards: [...byHazard].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hazard, events]) => ({ hazard, events })),
    notice: "Cifras históricas de emergencias (INDECI/SINPAD). No representan la ocupación actual de ningún albergue.",
  };
});
