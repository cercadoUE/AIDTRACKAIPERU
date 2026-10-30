import type { Repository } from "../ports/repository";
import type { Shelter, ShelterNeed, InventoryItem, PriorityLevel } from "../domain/types";
import { DEPARTMENTS, DEPT_BY_CODE, PRODUCT_BY_KEY, productLabel } from "../domain/catalog";
import { computePriority, isOpenNeed, pendingQuantity, type PriorityResult } from "./priority";
import { getSettings } from "./donations";
import type { Actor } from "../lib/auth";
import { sanitizeShelter } from "./shelters";

export interface ShelterView {
  shelter: ReturnType<typeof sanitizeShelter>;
  priority: PriorityResult;
  inventory: InventoryItem[];
  needs: ShelterNeed[];
  pendingTotal: number;
  received: number;
  mainNeedLabel: string | null;
}

export async function shelterViews(repo: Repository, actor: Actor | null, opts: { includeInactive?: boolean } = {}): Promise<ShelterView[]> {
  const [shelters, inv, needs, settings] = await Promise.all([repo.list("shelters"), repo.list("inventory"), repo.list("needs"), getSettings(repo)]);
  const invBy = groupBy(inv, (i) => i.shelterId);
  const needBy = groupBy(needs, (n) => n.shelterId);
  const visible = shelters.filter((s) => opts.includeInactive || actor?.role === "admin" || s.status === "active" || s.status === "simulated" || (s.status === "pending" && (actor?.id === s.coordinatorId)));
  return visible.map((s) => {
    const sn = needBy.get(s.id) ?? [];
    const priority = computePriority({ shelter: s, inventory: invBy.get(s.id) ?? [], needs: sn, ...settings });
    return {
      shelter: sanitizeShelter(s, actor),
      priority,
      inventory: invBy.get(s.id) ?? [],
      needs: sn,
      pendingTotal: sn.filter(isOpenNeed).reduce((a, n) => a + pendingQuantity(n), 0),
      received: sn.reduce((a, n) => a + n.fulfilled, 0),
      mainNeedLabel: priority.mainNeed ? productLabel(priority.mainNeed) : null,
    };
  });
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const a of arr) m.set(key(a), [...(m.get(key(a)) ?? []), a]);
  return m;
}

export type RankingMode = "national" | "department" | "product" | "deficit" | "urgency";

export async function ranking(repo: Repository, actor: Actor | null, params: { mode: RankingMode; department?: string; product?: string }) {
  let views = (await shelterViews(repo, actor)).filter((v) => v.shelter.status === "active" || v.shelter.status === "simulated");
  if (params.mode === "department" && params.department) views = views.filter((v) => v.shelter.departmentCode === params.department);
  let rows = views.map((v) => {
    let value = v.priority.score;
    let note: string | null = null;
    if (params.mode === "product" && params.product) {
      const pend = v.needs.filter((n) => n.product === params.product && isOpenNeed(n)).reduce((a, n) => a + pendingQuantity(n), 0);
      value = pend > 0 ? pend : null;
      note = pend > 0 ? `${pend} ${PRODUCT_BY_KEY.get(params.product)?.unit ?? ""} pendientes` : null;
    } else if (params.mode === "deficit") {
      value = v.priority.factors.deficit === null ? null : Math.round(v.priority.factors.deficit * 100);
    } else if (params.mode === "urgency") {
      value = v.priority.factors.severity === null ? null : Math.round(v.priority.factors.severity * 100);
    }
    return { v, value, note };
  });
  if (params.mode === "product") rows = rows.filter((r) => r.value !== null);
  const known = rows.filter((r) => r.value !== null).sort((a, b) => (b.value as number) - (a.value as number));
  const unknown = rows.filter((r) => r.value === null);
  return [...known, ...unknown].map((r, i) => ({
    rank: r.value === null ? null : i + 1,
    shelterId: r.v.shelter.id,
    name: r.v.shelter.name,
    department: r.v.shelter.department,
    departmentCode: r.v.shelter.departmentCode,
    occupants: r.v.shelter.occupants,
    mainNeed: r.v.mainNeedLabel,
    autonomyDays: r.v.priority.autonomyDays,
    index: r.v.priority.score,
    metric: r.value,
    note: r.note,
    level: r.v.priority.level,
    confidence: r.v.priority.confidence,
    preliminary: r.v.priority.confidence === "baja" || r.v.priority.stale,
    updatedAt: r.v.shelter.dataUpdatedAt,
    verified: r.v.shelter.verified,
    simulated: r.v.shelter.is_simulated,
    status: r.v.shelter.status,
  }));
}

export async function dashboard(repo: Repository, actor: Actor | null) {
  const [views, donations, items, allocs, shipments, centers] = await Promise.all([
    shelterViews(repo, actor, { includeInactive: true }),
    repo.list("donations"), repo.list("donationItems"), repo.list("allocations"), repo.list("shipments"), repo.list("centers"),
  ]);
  const operating = views.filter((v) => ["active", "simulated"].includes(v.shelter.status));
  const needs = operating.flatMap((v) => v.needs.filter(isOpenNeed));
  const pendingTotal = needs.reduce((a, n) => a + pendingQuantity(n), 0);
  const requestedTotal = needs.reduce((a, n) => a + (n.quantity ?? 0), 0);
  const coveredTotal = needs.reduce((a, n) => a + n.fulfilled + n.reserved, 0);
  const donated = items.reduce((a, i) => a + i.quantity, 0);
  const assigned = items.reduce((a, i) => a + i.reserved, 0);

  const byDept = DEPARTMENTS.map((d) => {
    const vs = operating.filter((v) => v.shelter.departmentCode === d.code);
    const ns = vs.flatMap((v) => v.needs.filter(isOpenNeed));
    const req = ns.reduce((a, n) => a + (n.quantity ?? 0), 0);
    const cov = ns.reduce((a, n) => a + n.fulfilled + n.reserved, 0);
    const scores = vs.map((v) => v.priority.score).filter((s): s is number => s !== null);
    return {
      code: d.code, name: d.name, shelters: vs.length, occupants: vs.reduce((a, v) => a + v.shelter.occupants, 0),
      pending: ns.reduce((a, n) => a + pendingQuantity(n), 0), assigned: ns.reduce((a, n) => a + n.reserved, 0),
      coverage: req > 0 ? Math.round((cov / req) * 100) : null,
      avgIndex: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      updatedAt: vs.map((v) => v.shelter.dataUpdatedAt).sort().pop() ?? null,
      simulated: vs.length > 0 && vs.every((v) => v.shelter.is_simulated),
    };
  });

  const byCategory = new Map<string, number>();
  for (const i of items) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.quantity);
  const prio: Record<PriorityLevel, number> = { critical: 0, high: 0, moderate: 0, low: 0, insufficient: 0 };
  for (const v of operating) prio[v.priority.level]++;
  const requested = new Map<string, number>();
  for (const n of needs) requested.set(n.product, (requested.get(n.product) ?? 0) + pendingQuantity(n));

  const evolution = new Map<string, number>();
  for (const d of donations) {
    const day = d.createdAt.slice(0, 10);
    evolution.set(day, (evolution.get(day) ?? 0) + items.filter((i) => i.donationId === d.id).length);
  }

  const stale = operating.filter((v) => v.priority.stale);
  const lowStock = operating.filter((v) => v.priority.autonomyDays !== null && v.priority.autonomyDays < 1.5);
  const unassigned = donations.filter((d) => d.status === "registered" || d.status === "validated");
  const pendingRequests = (await repo.list("needs", (n) => n.status === "pending")).length;

  return {
    kpis: {
      sheltersTotal: views.length,
      sheltersVerified: views.filter((v) => v.shelter.verified).length,
      sheltersSimulated: views.filter((v) => v.shelter.is_simulated).length,
      occupants: operating.reduce((a, v) => a + v.shelter.occupants, 0),
      donationsAvailable: donated - assigned,
      donationsAssigned: assigned,
      deliveriesConfirmed: shipments.filter((s) => s.status === "received").length,
      pendingNeeds: pendingTotal,
      coverage: requestedTotal > 0 ? Math.round((coveredTotal / requestedTotal) * 100) : null,
      donationsCount: donations.length,
      allocationsProposed: allocs.filter((a) => a.status === "proposed").length,
    },
    byDepartment: byDept.filter((d) => d.shelters > 0),
    donationsByCategory: [...byCategory].map(([category, quantity]) => ({ category, quantity })),
    priorityDistribution: Object.entries(prio).map(([level, count]) => ({ level, count })),
    topRequested: [...requested].map(([product, pending]) => ({ product, label: productLabel(product), pending })).sort((a, b) => b.pending - a.pending).slice(0, 8),
    evolution: [...evolution].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    topDeficit: [...operating].filter((v) => v.priority.score !== null).sort((a, b) => (b.priority.score as number) - (a.priority.score as number)).slice(0, 6).map((v) => ({ id: v.shelter.id, name: v.shelter.name, department: v.shelter.department, index: v.priority.score })),
    alerts: {
      critical: operating.filter((v) => v.priority.level === "critical").map((v) => ({ id: v.shelter.id, name: v.shelter.name, department: v.shelter.department, index: v.priority.score })),
      lowStock: lowStock.map((v) => ({ id: v.shelter.id, name: v.shelter.name, autonomyDays: v.priority.autonomyDays })),
      pendingRequests,
      unassignedDonations: unassigned.map((d) => ({ id: d.id, folio: d.folio })),
      stale: stale.map((v) => ({ id: v.shelter.id, name: v.shelter.name, updatedAt: v.shelter.dataUpdatedAt })),
    },
    centers: centers.length,
  };
}

export async function mapData(repo: Repository, actor: Actor | null) {
  const [views, centers] = await Promise.all([shelterViews(repo, actor), repo.list("centers")]);
  const dash = await dashboard(repo, actor);
  return {
    shelters: views.map((v) => ({
      id: v.shelter.id, name: v.shelter.name, lat: v.shelter.lat, lng: v.shelter.lng, department: v.shelter.department, departmentCode: v.shelter.departmentCode,
      province: v.shelter.province, district: v.shelter.district, capacity: v.shelter.capacity, occupants: v.shelter.occupants, level: v.priority.level,
      index: v.priority.score, confidence: v.priority.confidence, status: v.shelter.status, verified: v.shelter.verified, simulated: v.shelter.is_simulated,
      mainNeed: v.mainNeedLabel, mainNeedKey: v.priority.mainNeed ?? null, needCategories: [...new Set(v.needs.filter(isOpenNeed).map((n) => n.category))],
      inventory: v.inventory.map((i) => ({ product: productLabel(i.product), quantity: i.quantity, unit: i.unit })),
      needs: v.needs.filter(isOpenNeed).map((n) => ({ product: productLabel(n.product), pending: pendingQuantity(n), unit: n.unit, urgency: n.urgency })),
      received: v.received, hasData: v.priority.level !== "insufficient", updatedAt: v.shelter.dataUpdatedAt, explanation: v.priority.explanation,
    })),
    centers: centers.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, kind: c.kind, department: c.department, simulated: c.is_simulated })),
    departments: dash.byDepartment,
    deptCentroids: DEPARTMENTS,
  };
}

export { DEPT_BY_CODE };
export type { Shelter };
