import type { Repository } from "../ports/repository";
import type { Actor } from "../lib/auth";
import type { DistributionCenter, GeographicLocation, InventoryItem, Shelter, ShelterNeed, TableName, User, Urgency } from "../domain/types";
import { DEPT_BY_CODE, PRODUCT_BY_KEY } from "../domain/catalog";
import { hashPassword } from "../lib/auth";
import { nowIso } from "../lib/ids";
import { createDonation, recommend, approveAllocations } from "../services/donations";
import { createShipments, advanceShipment, confirmReceipt } from "../services/shipments";
import { DEFAULT_TARGET_DAYS, DEFAULT_WEIGHTS } from "../services/priority";

/** Contraseña de las cuentas demo. Se define con DEMO_PASSWORD; el valor por defecto solo sirve para desarrollo local. */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-local-2026";
/** Tablas de datos oficiales importados por ETL: el reinicio de la demo NO las toca. */
const KEEP: TableName[] = ["locations", "emergencyStats", "dataSources"];
const ALL: TableName[] = ["users", "shelters", "inventory", "needs", "donations", "donationItems", "allocations", "centers", "shipments", "shipmentEvents", "emergencies", "priorities", "optimizationRuns", "audit", "settings", "shelterHistory", "counters"];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COASTAL = new Set(["02", "04", "07", "11", "13", "14", "15", "18", "20", "23", "24"]);
const PLAN: { dept: string; n: number }[] = [
  { dept: "20", n: 5 }, { dept: "24", n: 3 }, { dept: "14", n: 3 }, { dept: "13", n: 3 }, { dept: "02", n: 3 },
  { dept: "15", n: 4 }, { dept: "11", n: 2 }, { dept: "08", n: 2 }, { dept: "21", n: 3 }, { dept: "16", n: 2 },
  { dept: "25", n: 2 }, { dept: "22", n: 2 }, { dept: "06", n: 2 }, { dept: "12", n: 2 }, { dept: "04", n: 2 },
  { dept: "10", n: 1 }, { dept: "05", n: 1 }, { dept: "01", n: 1 }, { dept: "17", n: 1 },
];
const KINDS = ["Albergue temporal", "Refugio comunitario", "Coliseo habilitado", "Institución educativa habilitada", "Centro de acogida"];

export const DEMO_USERS = [
  { email: "donante@aidtrack.demo", username: "demo", name: "Donante de demostración", role: "donor" as const },
  { email: "coordinador@aidtrack.demo", name: "Carlos Coordinador (demo)", role: "shelter_coordinator" as const },
  { email: "coordinador2@aidtrack.demo", name: "Camila Coordinadora (demo)", role: "shelter_coordinator" as const },
  { email: "logistica@aidtrack.demo", name: "Luis Logística (demo)", role: "logistics" as const },
  { email: "admin@aidtrack.demo", name: "Ana Administradora (demo)", role: "admin" as const },
];

const simProv = (at: string) => ({ source_type: "simulated" as const, source_name: "Dataset de demostración AIDTRACK (simulado)", imported_at: at, last_verified_at: null, is_simulated: true });

export async function seedDemo(repo: Repository) {
  for (const t of ALL) for (const row of await repo.list(t)) await repo.remove(t, (row as { id: string }).id);
  void KEEP;
  const at = nowIso();
  const rand = rng(20261030);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  await repo.put("settings", { id: "settings", createdAt: at, updatedAt: at, weights: DEFAULT_WEIGHTS, targetDays: DEFAULT_TARGET_DAYS });

  const hash = await hashPassword(DEMO_PASSWORD);
  const users: User[] = DEMO_USERS.map((u, i) => ({ id: `usr_demo_${i + 1}`, createdAt: at, updatedAt: at, passwordHash: hash, ...u }));
  for (const u of users) await repo.put("users", u);

  // Distritos reales del catálogo oficial (si ya se importó); coordenadas SIMULADAS.
  const locs = await repo.list("locations");
  const byDept = new Map<string, GeographicLocation[]>();
  for (const l of locs) byDept.set(l.departmentCode, [...(byDept.get(l.departmentCode) ?? []), l]);

  const shelters: Shelter[] = [];
  let k = 0;
  for (const { dept, n } of PLAN) {
    const d = DEPT_BY_CODE.get(dept)!;
    for (let i = 0; i < n; i++) {
      k++;
      const loc = byDept.get(dept) ? pick(byDept.get(dept)!) : undefined;
      const capacity = Math.round(60 + rand() * 340);
      const occupants = Math.round(capacity * (0.35 + rand() * 0.6));
      const lat = d.lat + (rand() - 0.5) * 0.7;
      const lng = d.lng + (COASTAL.has(dept) ? 0.1 + rand() * 0.45 : (rand() - 0.5) * 0.7);
      const district = loc?.district ?? d.name;
      const stale = rand() < 0.15;
      const s: Shelter = {
        id: `shl_demo_${String(k).padStart(2, "0")}`, createdAt: at, updatedAt: at, dataUpdatedAt: stale ? ago(9 + Math.floor(rand() * 5)) : ago(rand() * 2.5),
        name: `${pick(KINDS)} SIMULADO ${district}`, departmentCode: dept, department: d.name, province: loc?.province ?? d.name, district,
        ubigeo: loc?.ubigeo ?? `${dept}0101`, address: `Dirección simulada ${k}`, lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000,
        capacity, occupants, families: Math.round(occupants / 4.2), type: pick(["Albergue temporal", "Refugio", "Local comunal", "Institución educativa"]),
        status: "simulated", verified: false,
        contact: { name: `Responsable simulado ${k}`, phone: "999000000" },
        vulnerableShare: rand() < 0.7 ? Math.round((0.15 + rand() * 0.4) * 100) / 100 : undefined,
        accessDifficulty: rand() < 0.8 ? Math.round(rand() * 100) / 100 : undefined,
        ...simProv(at),
      };
      shelters.push(s);
      await repo.put("shelters", s);
    }
  }

  // Inventarios y necesidades con perfiles variados (algunos sin datos para probar "información insuficiente").
  const profile = (s: Shelter, idx: number) => (idx % 9 === 8 ? "nodata" : idx % 4 === 0 ? "critical" : idx % 4 === 1 ? "high" : idx % 4 === 2 ? "mid" : "ok");
  for (const [idx, s] of shelters.entries()) {
    const p = profile(s, idx);
    if (p !== "nodata") {
      const factor = { critical: 0.08, high: 0.25, mid: 0.6, ok: 1.4 }[p];
      const inv: [string, number][] = [
        ["agua_potable", s.occupants * 3 * DEFAULT_TARGET_DAYS * factor * (0.7 + rand() * 0.6)],
        ["arroz", s.occupants * 0.15 * DEFAULT_TARGET_DAYS * factor * (0.7 + rand() * 0.6)],
        ["frazadas", s.occupants * 0.9 * (factor > 1 ? 1.1 : factor)],
        ["kit_higiene", s.occupants * 0.4 * (factor > 1 ? 1.1 : factor)],
      ];
      for (const [product, q] of inv) {
        const it: InventoryItem = { id: `inv_${s.id}_${product}`, createdAt: at, updatedAt: at, shelterId: s.id, product, quantity: Math.round(q), unit: PRODUCT_BY_KEY.get(product)!.unit };
        await repo.put("inventory", it);
      }
    }
    const needSet: [string, number, Urgency][] =
      p === "critical" ? [["agua_potable", Math.round(s.occupants * 6), "critical"], ["frazadas", Math.round(s.occupants * 0.7), "high"], ["arroz", Math.round(s.occupants * 0.5), "high"]]
      : p === "high" ? [["agua_potable", Math.round(s.occupants * 3), "high"], ["kit_higiene", Math.round(s.occupants * 0.4), "medium"]]
      : p === "mid" ? [["frazadas", Math.round(s.occupants * 0.4), "medium"], ["arroz", Math.round(s.occupants * 0.3), "low"]]
      : p === "ok" ? [["kit_higiene", Math.round(s.occupants * 0.1) + 1, "low"]] : [];
    if (p === "nodata") {
      // Una necesidad con cantidad pendiente de confirmar: no entra al optimizador.
      const n: ShelterNeed = { id: `need_${s.id}_p`, createdAt: at, updatedAt: at, shelterId: s.id, category: "agua", product: "agua_potable", quantity: null, fulfilled: 0, reserved: 0, unit: "litros", urgency: "medium", status: "pending", notes: "Cantidad pendiente de confirmar", ...simProv(at) };
      await repo.put("needs", n);
    }
    for (const [product, q, urgency] of needSet) {
      const def = PRODUCT_BY_KEY.get(product)!;
      await repo.put("needs", { id: `need_${s.id}_${product}`, createdAt: at, updatedAt: at, shelterId: s.id, category: def.category, product, quantity: Math.max(1, q), fulfilled: 0, reserved: 0, unit: def.unit, urgency, status: "validated", ...simProv(at) });
    }
  }

  const centers: DistributionCenter[] = [
    ["Almacén SIMULADO Lima Norte", "LIMA", "almacen", -11.96, -77.07], ["Centro de distribución SIMULADO Piura", "PIURA", "centro", -5.2, -80.6],
    ["Almacén SIMULADO Chiclayo", "LAMBAYEQUE", "almacen", -6.77, -79.84], ["Centro de distribución SIMULADO Trujillo", "LA LIBERTAD", "centro", -8.11, -79.03],
    ["Almacén SIMULADO Cusco", "CUSCO", "almacen", -13.52, -71.97], ["Centro de distribución SIMULADO Iquitos", "LORETO", "centro", -3.75, -73.25],
  ].map(([name, department, kind, lat, lng], i) => ({ id: `ctr_demo_${i + 1}`, createdAt: at, updatedAt: at, name: name as string, department: department as string, kind: kind as "centro" | "almacen", lat: lat as number, lng: lng as number, ...simProv(at) }));
  for (const c of centers) await repo.put("centers", c);

  await repo.put("emergencies", { id: "emg_demo_1", createdAt: at, updatedAt: at, name: "Lluvias intensas SIMULADAS - costa norte", hazard: "LLUVIA INTENSA", departmentCode: "20", description: "Escenario ficticio para demostración", severity: 3, ...simProv(at) });

  // Donaciones de demostración generadas con los mismos servicios que usa la app (flujo real).
  const donor: Actor = { id: users[0].id, name: users[0].name, email: users[0].email, role: "donor" };
  const logistics: Actor = { id: users[3].id, name: users[3].name, email: users[3].email, role: "logistics" };
  const mk = async (days: number, items: { p: string; q: number }[], dept: string, depth: "registered" | "assigned" | "approved" | "in_transit" | "received") => {
    const d = DEPT_BY_CODE.get(dept)!;
    const { donation } = await createDonation(repo, donor, {
      channel: "form", transportAvailable: true, departmentCode: dept, lat: d.lat, lng: d.lng, confirmed: true,
      items: items.map(({ p, q }) => ({ category: PRODUCT_BY_KEY.get(p)!.category, product: p, quantity: q, unit: PRODUCT_BY_KEY.get(p)!.unit })),
    });
    if (depth !== "registered") await recommend(repo, logistics, donation.id);
    if (depth === "approved" || depth === "in_transit" || depth === "received") await approveAllocations(repo, logistics, donation.id);
    if (depth === "in_transit" || depth === "received") {
      const ships = await createShipments(repo, logistics, donation.id);
      for (const { shipment, confirmationCode } of ships) {
        for (const st of ["prepared", "dispatched", "in_transit"] as const) await advanceShipment(repo, logistics, shipment.id, st);
        if (depth === "received") {
          await advanceShipment(repo, logistics, shipment.id, "delivered");
          const sh = await repo.get("shelters", shipment.shelterId);
          const coord: Actor = { id: `usr_sim_coord_${shipment.shelterId}`, name: "Coordinador simulado", email: "", role: "shelter_coordinator", shelterId: sh!.id };
          await confirmReceipt(repo, coord, shipment.id, confirmationCode, "Recepción simulada");
        }
      }
    }
    // Se retrasa la fecha para alimentar la gráfica de evolución y se marca como simulada.
    const fresh = (await repo.get("donations", donation.id))!;
    Object.assign(fresh, { createdAt: ago(days), ...simProv(at) });
    await repo.put("donations", fresh);
  };
  await mk(21, [{ p: "agua_potable", q: 400 }, { p: "arroz", q: 150 }], "20", "received");
  await mk(14, [{ p: "frazadas", q: 120 }, { p: "kit_higiene", q: 60 }], "15", "received");
  await mk(7, [{ p: "agua_potable", q: 300 }], "13", "in_transit");
  await mk(4, [{ p: "arroz", q: 200 }, { p: "frazadas", q: 80 }], "14", "approved");
  await mk(2, [{ p: "agua_potable", q: 150 }, { p: "kit_higiene", q: 40 }], "02", "assigned");
  await mk(1, [{ p: "arroz", q: 90 }], "11", "registered");

  await repo.put("audit", { id: "aud_seed", createdAt: at, updatedAt: at, at, actorId: "system", action: "seed.demo", entity: "system", entityId: "seed", detail: { shelters: shelters.length } });
  return { shelters: shelters.length, users: users.length };
}
