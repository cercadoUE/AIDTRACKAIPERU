import { PRODUCT_BY_KEY, productLabel } from "../domain/catalog";
import type { InventoryItem, PriorityLevel, Shelter, ShelterNeed, SettingsRecord, Urgency } from "../domain/types";

export const DEFAULT_WEIGHTS: SettingsRecord["weights"] = {
  deficit: 35,
  autonomy: 25,
  severity: 20,
  vulnerability: 10,
  logistics: 10,
};
export const DEFAULT_TARGET_DAYS = 3;
const STALE_DAYS = 7;
const URGENCY_VALUE: Record<Urgency, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };

export interface PriorityInput {
  shelter: Shelter;
  inventory: InventoryItem[];
  needs: ShelterNeed[];
  weights?: SettingsRecord["weights"];
  targetDays?: number;
  now?: Date;
}

export interface PriorityResult {
  score: number | null;
  level: PriorityLevel;
  confidence: "alta" | "media" | "baja";
  factors: { deficit: number | null; autonomy: number | null; severity: number | null; vulnerability: number | null; logistics: number | null };
  mainNeed?: string;
  autonomyDays: number | null;
  stale: boolean;
  missing: string[];
  explanation: string;
}

export function levelFor(score: number | null, factorCount: number): PriorityLevel {
  if (score === null || factorCount < 2) return "insufficient";
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

export const LEVEL_LABEL: Record<PriorityLevel, string> = {
  critical: "Crítica",
  high: "Alta",
  moderate: "Moderada",
  low: "Baja",
  insufficient: "Información insuficiente",
};

function pending(n: ShelterNeed): number {
  if (n.quantity === null) return 0;
  return Math.max(0, n.quantity - n.fulfilled - n.reserved);
}

function openNeed(n: ShelterNeed): boolean {
  return n.status === "validated" || n.status === "partial";
}

/**
 * Índice de necesidad 0–100. Pesos y objetivos son experimentales y configurables.
 * Si faltan factores, se renormaliza con los disponibles y baja la confianza:
 * la falta de información no penaliza el puntaje.
 */
export function computePriority(input: PriorityInput): PriorityResult {
  const { shelter, inventory, needs } = input;
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const targetDays = input.targetDays ?? DEFAULT_TARGET_DAYS;
  const now = input.now ?? new Date();
  const people = shelter.occupants;
  const missing: string[] = [];
  const invBy = new Map(inventory.map((i) => [i.product, i.quantity]));

  // Déficit relativo y autonomía sobre productos esenciales con consumo definido.
  let deficit: number | null = null;
  let autonomyDays: number | null = null;
  let worstProduct: string | undefined;
  if (people > 0) {
    const deficits: number[] = [];
    let minDays = Infinity;
    let worstDeficit = -1;
    for (const p of PRODUCT_BY_KEY.values()) {
      if (!p.essential || p.dailyPerPerson === null) continue;
      if (!invBy.has(p.key)) continue; // sin registro de inventario => sin dato (no se asume cero)
      const stock = invBy.get(p.key)!;
      const daily = people * p.dailyPerPerson;
      const target = daily * targetDays;
      const d = Math.max(0, 1 - stock / target);
      deficits.push(d);
      const days = stock / daily;
      if (days < minDays) minDays = days;
      if (d > worstDeficit) {
        worstDeficit = d;
        worstProduct = p.key;
      }
    }
    if (deficits.length) {
      deficit = deficits.reduce((a, b) => a + b, 0) / deficits.length;
      autonomyDays = Math.round(minDays * 10) / 10;
    }
  }
  if (deficit === null) missing.push("inventario de productos esenciales u ocupación");

  const autonomy = autonomyDays === null ? null : 1 - Math.min(autonomyDays, 7) / 7;

  // Gravedad de necesidades abiertas.
  const open = needs.filter(openNeed).filter((n) => pending(n) > 0 || n.quantity === null);
  let severity: number | null = null;
  if (open.length) {
    const sorted = open.map((n) => URGENCY_VALUE[n.urgency]).sort((a, b) => b - a);
    const top = sorted[0];
    const breadth = Math.min(1, sorted.length / 5);
    severity = Math.min(1, top * 0.8 + breadth * 0.2);
  } else {
    missing.push("necesidades validadas");
  }

  const vulnerability = shelter.vulnerableShare ?? null;
  if (vulnerability === null) missing.push("proporción de personas vulnerables");
  const logistics = shelter.accessDifficulty ?? null;
  if (logistics === null) missing.push("dificultad logística");

  const entries: [keyof PriorityResult["factors"], number | null, number][] = [
    ["deficit", deficit, weights.deficit],
    ["autonomy", autonomy, weights.autonomy],
    ["severity", severity, weights.severity],
    ["vulnerability", vulnerability, weights.vulnerability],
    ["logistics", logistics, weights.logistics],
  ];
  const present = entries.filter(([, v]) => v !== null);
  const totalW = present.reduce((a, [, , w]) => a + w, 0);
  const score =
    present.length === 0 || totalW === 0
      ? null
      : Math.round(present.reduce((a, [, v, w]) => a + (v as number) * w, 0) / totalW * 1000) / 10;

  const ageDays = (now.getTime() - new Date(shelter.dataUpdatedAt).getTime()) / 86_400_000;
  const stale = ageDays > STALE_DAYS;
  let confidence: "alta" | "media" | "baja" = "baja";
  if (present.length >= 4 && ageDays <= 3) confidence = "alta";
  else if (present.length >= 3 && ageDays <= 10) confidence = "media";

  const factors = Object.fromEntries(entries.map(([k, v]) => [k, v === null ? null : Math.round(v * 1000) / 1000])) as PriorityResult["factors"];
  const level = levelFor(score, present.length);

  const mainNeed = pickMainNeed(open, worstProduct);
  const explanation = explain({ shelter, level, score, autonomyDays, worstProduct, open, missing, confidence, stale, ageDays, mainNeed });

  return { score, level, confidence, factors, mainNeed, autonomyDays, stale, missing, explanation };
}

function pickMainNeed(open: ShelterNeed[], worstProduct?: string): string | undefined {
  if (open.length) {
    const best = [...open].sort((a, b) => URGENCY_VALUE[b.urgency] - URGENCY_VALUE[a.urgency] || pending(b) - pending(a))[0];
    return best.product;
  }
  return worstProduct;
}

function explain(c: {
  shelter: Shelter;
  level: PriorityLevel;
  score: number | null;
  autonomyDays: number | null;
  worstProduct?: string;
  open: ShelterNeed[];
  missing: string[];
  confidence: string;
  stale: boolean;
  ageDays: number;
  mainNeed?: string;
}): string {
  if (c.level === "insufficient") {
    return `No hay datos suficientes para calcular una prioridad confiable (falta: ${c.missing.join(", ") || "información"}). Esto no implica que el albergue esté bien abastecido.`;
  }
  const parts: string[] = [];
  if (c.worstProduct) parts.push(`presenta el mayor déficit relativo en ${productLabel(c.worstProduct).toLowerCase()}`);
  if (c.autonomyDays !== null) parts.push(`tiene una autonomía estimada de ${c.autonomyDays} día(s) en su recurso más crítico`);
  const urgent = c.open.filter((n) => n.urgency === "critical" || n.urgency === "high");
  if (urgent.length) parts.push(`registra ${urgent.length} necesidad(es) de urgencia crítica o alta pendiente(s)`);
  const base = parts.length ? `Este albergue ${parts.join(", ")}.` : "No se registran déficits ni necesidades urgentes en los datos disponibles.";
  const notes: string[] = [];
  if (c.confidence === "baja") notes.push("Confianza baja: el cálculo usa pocos factores");
  if (c.stale) notes.push(`datos con ${Math.round(c.ageDays)} día(s) de antigüedad, conviene actualizarlos`);
  if (c.missing.length) notes.push(`sin dato de: ${c.missing.join(", ")}`);
  return notes.length ? `${base} ${notes.join("; ")}.` : base;
}

export { pending as pendingQuantity, openNeed as isOpenNeed };
