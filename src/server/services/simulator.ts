import { z } from "zod";
import type { Repository } from "../ports/repository";
import type { TableName } from "../domain/types";
import { MemoryRepository } from "../adapters/memory-repository";
import { DEPT_BY_CODE, PRODUCT_BY_KEY, productLabel } from "../domain/catalog";
import { createDonation, recommend } from "./donations";
import type { Actor } from "../lib/auth";
import { newId, nowIso } from "../lib/ids";
import { pendingQuantity, isOpenNeed } from "./priority";

const TABLES: TableName[] = ["shelters", "inventory", "needs", "donations", "donationItems", "allocations", "settings", "locations", "users"];

export const scenarioInput = z.object({
  name: z.string().min(3).max(80).default("Escenario simulado"),
  /** Donación hipotética que se intenta distribuir. */
  donation: z.object({ departmentCode: z.string().regex(/^\d{2}$/), items: z.array(z.object({ product: z.string(), quantity: z.number().positive().max(1_000_000) })).min(1).max(10) }),
  actions: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("emergency"), departmentCode: z.string().regex(/^\d{2}$/), severity: z.number().int().min(1).max(5) }),
    z.object({ type: z.literal("increase_needs"), departmentCode: z.string().regex(/^\d{2}$/), factor: z.number().min(1).max(10) }),
    z.object({ type: z.literal("set_inventory"), shelterId: z.string(), product: z.string(), quantity: z.number().min(0).max(1_000_000) }),
    z.object({ type: z.literal("block_route"), shelterId: z.string() }),
    z.object({ type: z.literal("add_donation"), product: z.string(), quantity: z.number().positive().max(1_000_000) }),
  ])).max(30).default([]),
});
export type ScenarioInput = z.infer<typeof scenarioInput>;

const COST_PER_KM_PER_100_UNITS = 0.9; // S/ por km por cada 100 unidades. Estimación EXPERIMENTAL.

async function clone(repo: Repository): Promise<MemoryRepository> {
  const m = new MemoryRepository();
  for (const t of TABLES) for (const row of await repo.list(t)) await m.put(t, row as never);
  return m;
}

interface Snapshot {
  uncoveredUnits: number;
  weightedUncovered: number;
  availableUnits: number;
  assignedUnits: number;
  coveredNeeds: number;
  openNeeds: number;
  shelters: number;
  totalKm: number;
  estimatedCostPEN: number;
  method: string;
  allocations: { shelter: string; department: string; product: string; quantity: number; unit: string; km: number }[];
}

async function measure(repo: Repository, donorItems: { product: string; quantity: number }[], dept: string, blocked: string[]): Promise<Snapshot> {
  const actor: Actor = { id: "sim", name: "Simulación", email: "", role: "admin" };
  const d = DEPT_BY_CODE.get(dept)!;
  const { donation, items } = await createDonation(repo, actor, {
    channel: "form", transportAvailable: true, confirmed: true, departmentCode: dept, lat: d.lat, lng: d.lng,
    items: donorItems.map((i) => ({ category: PRODUCT_BY_KEY.get(i.product)!.category, product: i.product, quantity: i.quantity, unit: PRODUCT_BY_KEY.get(i.product)!.unit })),
  });
  const rec = await recommend(repo, actor, donation.id, { blockedShelterIds: blocked, persist: false });
  const needs = (await repo.list("needs")).filter(isOpenNeed);
  const products = new Set(items.map((i) => i.product));
  const relevant = needs.filter((n) => products.has(n.product));
  const open = relevant.reduce((a, n) => a + pendingQuantity(n), 0);
  const assigned = rec.allocations.reduce((a, x) => a + x.quantity, 0);
  const totalKm = rec.allocations.reduce((a, x) => a + x.distanceKm, 0);
  const cost = rec.allocations.reduce((a, x) => a + (x.quantity / 100) * x.distanceKm * COST_PER_KM_PER_100_UNITS, 0);
  const covered = new Set(rec.allocations.filter((a) => a.coverage >= 0.999).map((a) => a.needId)).size;
  return {
    uncoveredUnits: Math.max(0, open - assigned), weightedUncovered: Math.round(rec.run.uncoveredAfter * 10) / 10, availableUnits: items.reduce((a, i) => a + i.quantity, 0),
    assignedUnits: assigned, coveredNeeds: covered, openNeeds: relevant.length, shelters: new Set(rec.allocations.map((a) => a.shelterId)).size,
    totalKm: Math.round(totalKm), estimatedCostPEN: Math.round(cost * 100) / 100, method: rec.run.method,
    allocations: rec.allocations.map((a) => ({ shelter: a.shelterName, department: a.department, product: productLabel(a.product), quantity: a.quantity, unit: a.unit, km: a.distanceKm })),
  };
}

/** Ejecuta un escenario sobre una COPIA de los datos. Nunca escribe en el repositorio real. */
export async function simulate(real: Repository, input: ScenarioInput) {
  for (const i of input.donation.items) if (!PRODUCT_BY_KEY.has(i.product) || PRODUCT_BY_KEY.get(i.product)!.medicine) throw new Error(`Producto no permitido en simulación: ${i.product}`);
  const base = await clone(real);
  const before = await measure(base, input.donation.items, input.donation.departmentCode, []);

  const sim = await clone(real);
  const blocked: string[] = [];
  const explain: string[] = [];
  const extra: { product: string; quantity: number }[] = [];
  const at = nowIso();
  for (const a of input.actions) {
    if (a.type === "emergency") {
      const shelters = await sim.list("shelters", (s) => s.departmentCode === a.departmentCode);
      let n = 0;
      for (const s of shelters) {
        const incoming = Math.round(s.capacity * 0.08 * a.severity);
        s.occupants = Math.min(s.capacity, s.occupants + incoming);
        s.dataUpdatedAt = at;
        await sim.put("shelters", s);
        for (const need of await sim.list("needs", (x) => x.shelterId === s.id && x.quantity !== null)) {
          need.quantity = Math.round((need.quantity as number) * (1 + 0.15 * a.severity));
          await sim.put("needs", need);
          n++;
        }
      }
      explain.push(`Emergencia simulada (severidad ${a.severity}) en ${DEPT_BY_CODE.get(a.departmentCode)?.name}: aumentó la ocupación y ${n} necesidad(es) de ${shelters.length} albergue(s).`);
    } else if (a.type === "increase_needs") {
      let n = 0;
      for (const s of await sim.list("shelters", (x) => x.departmentCode === a.departmentCode))
        for (const need of await sim.list("needs", (x) => x.shelterId === s.id && x.quantity !== null)) {
          need.quantity = Math.round((need.quantity as number) * a.factor);
          await sim.put("needs", need);
          n++;
        }
      explain.push(`Necesidades x${a.factor} en ${DEPT_BY_CODE.get(a.departmentCode)?.name} (${n} registros).`);
    } else if (a.type === "set_inventory") {
      const inv = (await sim.list("inventory", (i) => i.shelterId === a.shelterId && i.product === a.product))[0];
      if (inv) await sim.put("inventory", { ...inv, quantity: a.quantity });
      else await sim.put("inventory", { id: newId("inv"), createdAt: at, updatedAt: at, shelterId: a.shelterId, product: a.product, quantity: a.quantity, unit: PRODUCT_BY_KEY.get(a.product)?.unit ?? "unidades" });
      explain.push(`Inventario de ${productLabel(a.product)} en el albergue ${a.shelterId} fijado en ${a.quantity}.`);
    } else if (a.type === "block_route") {
      blocked.push(a.shelterId);
      const s = await sim.get("shelters", a.shelterId);
      explain.push(`Ruta bloqueada hacia ${s?.name ?? a.shelterId}: no recibe asignaciones.`);
    } else if (a.type === "add_donation") {
      extra.push({ product: a.product, quantity: a.quantity });
      explain.push(`Se agregó una donación de ${a.quantity} de ${productLabel(a.product)}.`);
    }
  }
  const merged = new Map<string, number>();
  for (const i of [...input.donation.items, ...extra]) merged.set(i.product, (merged.get(i.product) ?? 0) + i.quantity);
  const after = await measure(sim, [...merged].map(([product, quantity]) => ({ product, quantity })), input.donation.departmentCode, blocked);

  const dAssigned = after.assignedUnits - before.assignedUnits;
  const dKm = after.totalKm - before.totalKm;
  explain.push(
    `Resultado: se asignan ${after.assignedUnits} unidades (${dAssigned >= 0 ? "+" : ""}${dAssigned} frente a antes) a ${after.shelters} albergue(s); quedan ${after.uncoveredUnits} sin cubrir (antes ${before.uncoveredUnits}). La distancia total estimada cambia ${dKm >= 0 ? "+" : ""}${dKm} km.`,
  );
  return { simulated: true, scenario: input.name, before, after, explanation: explain, notice: "ESCENARIO SIMULADO: no modifica los datos reales. Los costos son estimaciones experimentales con distancia lineal." };
}
