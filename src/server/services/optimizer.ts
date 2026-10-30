export interface OptItem {
  itemId: string;
  product: string;
  unit: string;
  stock: number;
}

export interface OptNeed {
  needId: string;
  shelterId: string;
  product: string;
  pending: number;
  /** Peso de prioridad (> 0). Mayor = más importante cubrir. */
  weight: number;
  /** Distancia donante→albergue en km; Infinity = ruta bloqueada o inaccesible. */
  distanceKm: number;
}

export interface OptAssignment {
  itemId: string;
  needId: string;
  shelterId: string;
  product: string;
  unit: string;
  quantity: number;
  pending: number;
  coverage: number;
  distanceKm: number;
}

export interface OptResult {
  method: "milp" | "greedy";
  assignments: OptAssignment[];
  uncoveredBefore: number;
  uncoveredAfter: number;
  objective: number;
  durationMs: number;
  notes: string[];
}

export const MAX_MILP_VARIABLES = 400;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

type HighsModule = { solve: (lp: string, options?: Record<string, unknown>) => { Status: string; ObjectiveValue: number; Columns: Record<string, { Primal: number }> } };
let highsPromise: Promise<HighsModule> | null = null;

async function loadHighs(): Promise<HighsModule> {
  if (!highsPromise) {
    highsPromise = (async () => {
      const mod = (await import("highs")) as unknown as { default: (opts?: unknown) => Promise<HighsModule> };
      return mod.default();
    })();
    highsPromise.catch(() => {
      highsPromise = null;
    });
  }
  return highsPromise;
}

/** Heurística de respaldo: asigna por peso de prioridad descendente y menor distancia. */
export function solveGreedy(items: OptItem[], needs: OptNeed[]): Omit<OptResult, "durationMs"> {
  const remaining = new Map(items.map((i) => [i.itemId, i.stock]));
  const needLeft = new Map(needs.map((n) => [n.needId, n.pending]));
  const assignments: OptAssignment[] = [];
  const ordered = [...needs].sort((a, b) => b.weight - a.weight || a.distanceKm - b.distanceKm);
  for (const n of ordered) {
    if (!Number.isFinite(n.distanceKm)) continue;
    for (const it of items.filter((i) => i.product === n.product)) {
      const stock = remaining.get(it.itemId) ?? 0;
      const left = needLeft.get(n.needId) ?? 0;
      const q = Math.min(Math.floor(stock), Math.floor(left));
      if (q <= 0) continue;
      remaining.set(it.itemId, stock - q);
      needLeft.set(n.needId, left - q);
      assignments.push({ itemId: it.itemId, needId: n.needId, shelterId: n.shelterId, product: n.product, unit: it.unit, quantity: q, pending: n.pending, coverage: q / n.pending, distanceKm: n.distanceKm });
    }
  }
  return finish("greedy", items, needs, assignments, []);
}

function finish(method: "milp" | "greedy", items: OptItem[], needs: OptNeed[], assignments: OptAssignment[], notes: string[]): Omit<OptResult, "durationMs"> {
  const productsWithStock = new Set(items.map((i) => i.product));
  const relevant = needs.filter((n) => productsWithStock.has(n.product));
  const uncoveredBefore = relevant.reduce((a, n) => a + n.weight * n.pending, 0);
  const given = new Map<string, number>();
  for (const a of assignments) given.set(a.needId, (given.get(a.needId) ?? 0) + a.quantity);
  const uncoveredAfter = relevant.reduce((a, n) => a + n.weight * Math.max(0, n.pending - (given.get(n.needId) ?? 0)), 0);
  return { method, assignments, uncoveredBefore, uncoveredAfter, objective: uncoveredAfter, notes };
}

/**
 * MILP por producto con HiGHS.
 *  min  Σ w_j·u_j + λ·Σ d_ij·x_ij + μ·Σ y_ij
 *  s.a. Σ_j x_ij ≤ stock_i        (no sobreasignar el stock del donante)
 *       Σ_i x_ij + u_j ≥ pend_j   (u_j = necesidad no cubierta)
 *       Σ_i x_ij ≤ pend_j         (no entregar más de lo necesario)
 *       lot·y_ij ≤ x_ij ≤ M·y_ij  (evita entregas diminutas)
 *  x entero ≥ 0, y binaria, u ≥ 0.
 */
export async function optimize(items: OptItem[], needs: OptNeed[]): Promise<OptResult> {
  const t0 = Date.now();
  const usable = needs.filter((n) => n.pending > 0 && Number.isFinite(n.distanceKm) && items.some((i) => i.product === n.product && i.stock > 0));
  const variables = usable.length * Math.max(1, items.length) * 2;
  if (variables > MAX_MILP_VARIABLES) {
    const g = solveGreedy(items, needs);
    return { ...g, durationMs: Date.now() - t0, notes: [`Problema grande (${variables} variables > ${MAX_MILP_VARIABLES}): se usó la heurística de respaldo.`] };
  }
  try {
    const highs = await loadHighs();
    const assignments: OptAssignment[] = [];
    const products = [...new Set(usable.map((n) => n.product))];
    for (const product of products) {
      const its = items.filter((i) => i.product === product && i.stock > 0);
      const nds = usable.filter((n) => n.product === product);
      const minW = Math.min(...nds.map((n) => n.weight));
      const maxD = Math.max(1, ...nds.map((n) => n.distanceKm));
      const lambda = (0.05 * minW) / maxD; // la distancia desempata, nunca domina a la prioridad
      const mu = 0.01 * minW;
      const obj: string[] = [];
      const cons: string[] = [];
      const bounds: string[] = [];
      const generals: string[] = [];
      const binaries: string[] = [];
      nds.forEach((n, j) => {
        obj.push(`${n.weight.toFixed(6)} u${j}`);
        bounds.push(`0 <= u${j}`);
        const xs = its.map((_, i) => `x${i}_${j}`);
        cons.push(`cov${j}: ${xs.join(" + ")} + u${j} >= ${n.pending}`);
        cons.push(`cap${j}: ${xs.join(" + ")} <= ${n.pending}`);
        its.forEach((it, i) => {
          obj.push(`${(lambda * n.distanceKm).toFixed(8)} x${i}_${j}`);
          obj.push(`${mu.toFixed(8)} y${i}_${j}`);
          const lot = Math.max(1, Math.min(n.pending, Math.floor(it.stock * 0.1)));
          cons.push(`lo${i}_${j}: x${i}_${j} - ${lot} y${i}_${j} >= 0`);
          cons.push(`up${i}_${j}: x${i}_${j} - ${Math.min(n.pending, it.stock)} y${i}_${j} <= 0`);
          generals.push(`x${i}_${j}`);
          binaries.push(`y${i}_${j}`);
        });
      });
      its.forEach((it, i) => {
        cons.push(`stock${i}: ${nds.map((_, j) => `x${i}_${j}`).join(" + ")} <= ${it.stock}`);
      });
      const lp = ["Minimize", ` obj: ${obj.join(" + ")}`, "Subject To", ...cons.map((c) => ` ${c}`), "Bounds", ...bounds.map((b) => ` ${b}`), "General", ` ${generals.join(" ")}`, "Binary", ` ${binaries.join(" ")}`, "End"].join("\n");
      const sol = highs.solve(lp);
      if (sol.Status !== "Optimal") throw new Error(`HiGHS estado ${sol.Status}`);
      nds.forEach((n, j) => {
        its.forEach((it, i) => {
          const q = Math.round(sol.Columns[`x${i}_${j}`]?.Primal ?? 0);
          if (q > 0) assignments.push({ itemId: it.itemId, needId: n.needId, shelterId: n.shelterId, product, unit: it.unit, quantity: q, pending: n.pending, coverage: q / n.pending, distanceKm: n.distanceKm });
        });
      });
    }
    // Verificación defensiva de factibilidad antes de devolver.
    assertFeasible(items, needs, assignments);
    const base = finish("milp", items, needs, assignments, []);
    return { ...base, durationMs: Date.now() - t0 };
  } catch (e) {
    const g = solveGreedy(items, needs);
    return { ...g, durationMs: Date.now() - t0, notes: [`El solver MILP falló (${(e as Error).message}); se usó la heurística de respaldo.`] };
  }
}

export function assertFeasible(items: OptItem[], needs: OptNeed[], assignments: OptAssignment[]) {
  const byItem = new Map<string, number>();
  const byNeed = new Map<string, number>();
  for (const a of assignments) {
    byItem.set(a.itemId, (byItem.get(a.itemId) ?? 0) + a.quantity);
    byNeed.set(a.needId, (byNeed.get(a.needId) ?? 0) + a.quantity);
  }
  for (const it of items) if ((byItem.get(it.itemId) ?? 0) > it.stock + 1e-9) throw new Error(`Sobreasignación del stock ${it.itemId}`);
  for (const n of needs) if ((byNeed.get(n.needId) ?? 0) > n.pending + 1e-9) throw new Error(`Sobreasignación de la necesidad ${n.needId}`);
}
