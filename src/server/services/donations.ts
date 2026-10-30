import type { Repository } from "../ports/repository";
import { ConditionFailedError } from "../ports/repository";
import type { Donation, DonationAllocation, DonationItem, DistributionCenter, OptimizationRun, Shelter } from "../domain/types";
import { PRODUCT_BY_KEY, DEPT_BY_CODE, productLabel } from "../domain/catalog";
import type { DonationInput } from "../domain/schemas";
import type { Actor } from "../lib/auth";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { folio, newId, nowIso } from "../lib/ids";
import { audit, userProvenance } from "./common";
import { computePriority, pendingQuantity, isOpenNeed, DEFAULT_WEIGHTS, DEFAULT_TARGET_DAYS } from "./priority";
import { haversineKm, optimize, type OptNeed, type OptItem } from "./optimizer";

export async function getSettings(repo: Repository) {
  const s = (await repo.list("settings"))[0];
  return { weights: s?.weights ?? DEFAULT_WEIGHTS, targetDays: s?.targetDays ?? DEFAULT_TARGET_DAYS };
}

export async function createDonation(repo: Repository, actor: Actor, input: DonationInput) {
  for (const it of input.items) {
    const def = PRODUCT_BY_KEY.get(it.product)!;
    if (def.category !== it.category) throw badRequest(`El producto ${it.product} no pertenece a la categoría ${it.category}`);
    // Las asignaciones comparan cantidades con necesidades en la unidad del catálogo: no se admiten otras unidades.
    if (it.unit !== def.unit) throw badRequest(`${def.label} se registra en ${def.unit}, no en ${it.unit}. Convierte la cantidad antes de confirmar.`);
  }
  const n = await repo.nextCounter(`DON-${new Date().getFullYear()}`);
  const at = nowIso();
  const dept = input.departmentCode ? DEPT_BY_CODE.get(input.departmentCode) : undefined;
  const medicine = input.items.some((i) => PRODUCT_BY_KEY.get(i.product)?.medicine);
  const donation: Donation = {
    id: newId("don"),
    createdAt: at,
    updatedAt: at,
    folio: folio("DON", n),
    donorId: actor.id,
    status: "registered",
    channel: input.channel,
    originalText: input.originalText,
    locationText: input.locationText,
    departmentCode: input.departmentCode,
    lat: input.lat ?? dept?.lat,
    lng: input.lng ?? dept?.lng,
    transportAvailable: input.transportAvailable,
    medicine,
    ...userProvenance(),
  };
  await repo.put("donations", donation);
  const items: DonationItem[] = [];
  for (const it of input.items) {
    const item: DonationItem = { id: newId("itm"), createdAt: at, updatedAt: at, donationId: donation.id, reserved: 0, ...it };
    await repo.put("donationItems", item);
    items.push(item);
  }
  await audit(repo, actor.id, "donation.create", "donation", donation.id, { folio: donation.folio, channel: input.channel });
  await repo.put("shipmentEvents", {
    id: newId("evt"), createdAt: at, updatedAt: at, shipmentId: `don:${donation.id}`, at, action: "Donación registrada",
    actorId: actor.id, actorRole: actor.role, from: null, to: "registered",
    quantities: Object.fromEntries(items.map((i) => [i.product, i.quantity])),
  });
  return { donation, items };
}

export interface Recommendation {
  run: OptimizationRun;
  allocations: (DonationAllocation & { shelterName: string; department: string; pendingBefore: number; confidence: string; simulated: boolean })[];
  excluded: { product: string; reason: string }[];
  notes: string[];
}

/**
 * Calcula (o recalcula) recomendaciones. No reserva stock: la reserva ocurre al aprobar.
 * Solo se consideran necesidades validadas de albergues activos o simulados con datos vigentes.
 */
export async function recommend(repo: Repository, actor: Actor, donationId: string, opts: { includeSimulated?: boolean; blockedShelterIds?: string[]; persist?: boolean } = {}): Promise<Recommendation> {
  const donation = await repo.get("donations", donationId);
  if (!donation) throw notFound("Donación no encontrada");
  if (actor.role === "donor" && donation.donorId !== actor.id) throw forbidden();
  if (["approved", "prepared", "dispatched", "in_transit", "delivered", "received"].includes(donation.status)) {
    throw conflict("La donación ya fue aprobada; no se puede recalcular");
  }
  const allItems = await repo.list("donationItems", (i) => i.donationId === donationId);
  const excluded: { product: string; reason: string }[] = [];
  const items = allItems.filter((i) => {
    if (PRODUCT_BY_KEY.get(i.product)?.medicine) {
      excluded.push({ product: i.product, reason: "Los medicamentos requieren validación humana de profesionales autorizados y no se asignan automáticamente." });
      return false;
    }
    return true;
  });
  const optItems: OptItem[] = items.map((i) => ({ itemId: i.id, product: i.product, unit: i.unit, stock: Math.max(0, i.quantity - i.reserved) }));

  // Elegibles: albergues activos y verificados, o albergues de demostración (identificados como simulados).
  const shelters = await repo.list("shelters", (s) => (s.status === "active" && s.verified) || s.status === "simulated");
  const allNeeds = await repo.list("needs");
  const settings = await getSettings(repo);
  const donorPoint = donation.lat !== undefined && donation.lng !== undefined ? { lat: donation.lat, lng: donation.lng } : null;
  const blocked = new Set(opts.blockedShelterIds ?? []);
  const shelterMap = new Map<string, Shelter>();
  const scoreMap = new Map<string, ReturnType<typeof computePriority>>();
  const optNeeds: OptNeed[] = [];
  for (const s of shelters) {
    const needs = allNeeds.filter((n) => n.shelterId === s.id);
    const inv = await repo.list("inventory", (i) => i.shelterId === s.id);
    const pr = computePriority({ shelter: s, inventory: inv, needs, ...settings });
    shelterMap.set(s.id, s);
    scoreMap.set(s.id, pr);
    for (const n of needs) {
      if (!isOpenNeed(n)) continue;
      const pending = pendingQuantity(n);
      if (pending <= 0) continue;
      if (!optItems.some((i) => i.product === n.product && i.stock > 0)) continue;
      const urgency = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 }[n.urgency];
      const weight = Math.round((urgency * (0.5 + (pr.score ?? 40) / 200) + 0.05) * 1000) / 1000;
      const dist = blocked.has(s.id) ? Infinity : donorPoint ? haversineKm(donorPoint, s) : 0;
      optNeeds.push({ needId: n.id, shelterId: s.id, product: n.product, pending, weight, distanceKm: dist });
    }
  }

  const result = await optimize(optItems, optNeeds);
  const runId = newId("run");
  const at = nowIso();
  const run: OptimizationRun = {
    id: runId, createdAt: at, updatedAt: at, donationId, method: result.method, objective: result.objective,
    uncoveredBefore: result.uncoveredBefore, uncoveredAfter: result.uncoveredAfter, durationMs: result.durationMs,
    simulated: shelters.some((s) => s.is_simulated),
  };

  // Se descartan propuestas anteriores aún no aprobadas.
  if (opts.persist !== false) {
    const old = await repo.list("allocations", (a) => a.donationId === donationId && a.status === "proposed");
    for (const o of old) await repo.remove("allocations", o.id);
    await repo.put("optimizationRuns", run);
  }

  const allocations: Recommendation["allocations"] = [];
  const sorted = [...result.assignments].sort((a, b) => (scoreMap.get(b.shelterId)?.score ?? 0) - (scoreMap.get(a.shelterId)?.score ?? 0) || b.quantity - a.quantity);
  for (const a of sorted) {
    const s = shelterMap.get(a.shelterId)!;
    const pr = scoreMap.get(a.shelterId)!;
    const base: DonationAllocation = {
      id: newId("alo"), createdAt: at, updatedAt: at, donationId, itemId: a.itemId, shelterId: a.shelterId, needId: a.needId,
      product: a.product, quantity: a.quantity, unit: a.unit, status: "proposed", distanceKm: a.distanceKm,
      coverage: Math.round(a.coverage * 1000) / 1000, optimizationRunId: runId,
      explanation: explainAllocation(a.quantity, a.unit, a.product, a.pending, a.coverage, a.distanceKm, !!donorPoint, s, pr.level, pr.autonomyDays),
    };
    if (opts.persist !== false) await repo.put("allocations", base);
    allocations.push({ ...base, shelterName: s.name, department: s.department, pendingBefore: a.pending, confidence: pr.confidence, simulated: s.is_simulated });
  }

  if (opts.persist !== false && allocations.length) {
    donation.status = "assigned";
    donation.updatedAt = at;
    await repo.put("donations", donation);
    await audit(repo, actor.id, "donation.recommend", "donation", donationId, { run: runId, method: result.method, count: allocations.length });
  } else if (opts.persist !== false && donation.status === "registered") {
    donation.status = "validated";
    donation.updatedAt = at;
    await repo.put("donations", donation);
  }
  return { run, allocations, excluded, notes: result.notes };
}

function explainAllocation(q: number, unit: string, product: string, pending: number, coverage: number, dist: number, hasOrigin: boolean, s: Shelter, level: string, autonomy: number | null): string {
  const lv = { critical: "crítica", high: "alta", moderate: "moderada", low: "baja", insufficient: "sin datos suficientes" }[level] ?? level;
  const parts = [
    `Se recomienda destinar ${q} ${unit} de ${productLabel(product).toLowerCase()} a ${s.name} porque tiene ${pending} ${unit} pendientes de ese producto (cubriría ${Math.round(coverage * 100)}%).`,
    `Prioridad general del albergue: ${lv}.`,
  ];
  if (autonomy !== null) parts.push(`Autonomía estimada: ${autonomy} día(s).`);
  parts.push(hasOrigin ? `Distancia lineal estimada: ${dist} km (no es ruta real).` : "Sin ubicación del donante: la distancia no se consideró.");
  if (s.is_simulated) parts.push("Albergue de demostración (dato simulado).");
  return parts.join(" ");
}

/**
 * Aprueba asignaciones (coordinador logístico). Reserva stock del donante y la necesidad
 * de forma atómica y condicional; si cualquier reserva falla se revierten las anteriores.
 */
export async function approveAllocations(repo: Repository, actor: Actor, donationId: string, allocationIds?: string[]) {
  const donation = await repo.get("donations", donationId);
  if (!donation) throw notFound("Donación no encontrada");
  if (donation.medicine && actor.role !== "admin") {
    // Los medicamentos nunca se asignan automáticamente; aquí solo hay ítems no médicos.
  }
  let allocs = await repo.list("allocations", (a) => a.donationId === donationId && a.status === "proposed");
  if (allocationIds) allocs = allocs.filter((a) => allocationIds.includes(a.id));
  if (!allocs.length) throw conflict("No hay asignaciones propuestas por aprobar");
  const done: { alloc: DonationAllocation; itemReserved: boolean }[] = [];
  const approved: DonationAllocation[] = [];
  try {
    for (const a of allocs) {
      const item = await repo.get("donationItems", a.itemId);
      const need = await repo.get("needs", a.needId);
      if (!item || !need || need.quantity === null) throw new ConditionFailedError("Ítem o necesidad no disponible");
      // 1) stock del donante: reserved + q <= quantity
      await repo.adjust("donationItems", item.id, "reserved", a.quantity, { max: item.quantity });
      const step = { alloc: a, itemReserved: true };
      done.push(step);
      // 2) necesidad: fulfilled + reserved + q <= quantity
      await repo.adjust("needs", need.id, "reserved", a.quantity, { max: need.quantity - need.fulfilled });
      approved.push(a);
    }
  } catch (e) {
    // Reversión compensatoria.
    for (const d of done) {
      await repo.adjust("donationItems", d.alloc.itemId, "reserved", -d.alloc.quantity).catch(() => {});
    }
    for (const a of approved) {
      await repo.adjust("needs", a.needId, "reserved", -a.quantity).catch(() => {});
    }
    if (e instanceof ConditionFailedError) throw conflict("La asignación ya no es válida (stock o necesidad cambiaron). Recalcula las recomendaciones.");
    throw e;
  }
  const at = nowIso();
  for (const a of approved) {
    await repo.put("allocations", { ...a, status: "approved", approvedBy: actor.id, updatedAt: at });
  }
  donation.status = "approved";
  donation.updatedAt = at;
  await repo.put("donations", donation);
  await audit(repo, actor.id, "allocation.approve", "donation", donationId, { allocations: approved.map((a) => a.id) });
  await repo.put("shipmentEvents", {
    id: newId("evt"), createdAt: at, updatedAt: at, shipmentId: `don:${donationId}`, at, action: "Asignación aprobada por coordinación logística",
    actorId: actor.id, actorRole: actor.role, from: "assigned", to: "approved",
    quantities: Object.fromEntries(approved.map((a) => [`${a.product}@${a.shelterId}`, a.quantity])),
  });
  return approved.map((a) => a.id);
}

export async function listDonationsFor(repo: Repository, actor: Actor) {
  const all = await repo.list("donations");
  if (actor.role === "donor") return all.filter((d) => d.donorId === actor.id);
  if (actor.role === "shelter_coordinator") {
    const allocs = await repo.list("allocations", (a) => a.shelterId === actor.shelterId && a.status === "approved");
    const ids = new Set(allocs.map((a) => a.donationId));
    return all.filter((d) => ids.has(d.id));
  }
  return all;
}

export async function distributionCenters(repo: Repository): Promise<DistributionCenter[]> {
  return repo.list("centers");
}
