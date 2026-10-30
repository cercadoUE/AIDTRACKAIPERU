import type { Repository } from "../ports/repository";
import type { Shelter, ShelterNeed, InventoryItem } from "../domain/types";
import { DEPT_BY_CODE, PRODUCT_BY_KEY } from "../domain/catalog";
import type { NeedInput, ShelterInput } from "../domain/schemas";
import type { Actor } from "../lib/auth";
import { assertShelterAccess, canSeeContacts } from "../lib/auth";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId, nowIso } from "../lib/ids";
import { audit, userProvenance } from "./common";

/** Quita datos personales cuando el actor no está autorizado. */
export function sanitizeShelter(s: Shelter, actor: Actor | null): Shelter & { hasContact: boolean } {
  const allowed = canSeeContacts(actor, s.id);
  const { contact, coordinatorId, ...rest } = s;
  void coordinatorId;
  return { ...rest, ...(allowed && contact ? { contact } : {}), hasContact: !!contact };
}

export async function createShelter(repo: Repository, actor: Actor, input: ShelterInput) {
  const dept = DEPT_BY_CODE.get(input.departmentCode);
  if (!dept) throw badRequest("Departamento inválido");
  if (!input.ubigeo.startsWith(input.departmentCode)) throw badRequest("El UBIGEO no corresponde al departamento");
  const at = nowIso();
  const shelter: Shelter = {
    id: newId("shl"), createdAt: at, updatedAt: at, dataUpdatedAt: at,
    name: input.name, departmentCode: dept.code, department: dept.name, province: input.province, district: input.district,
    ubigeo: input.ubigeo, address: input.address, lat: input.lat, lng: input.lng,
    capacity: input.capacity, occupants: Math.min(input.occupants, input.capacity), families: input.families, type: input.type,
    status: "pending", verified: false, coordinatorId: actor.id,
    contact: input.contactName && input.contactPhone ? { name: input.contactName, phone: input.contactPhone } : undefined,
    vulnerableShare: input.vulnerableShare, accessDifficulty: input.accessDifficulty,
    ...userProvenance("Registro de albergue por usuario"),
  };
  if (input.occupants > input.capacity) throw badRequest("La ocupación no puede superar la capacidad máxima");
  await repo.put("shelters", shelter);
  await audit(repo, actor.id, "shelter.create", "shelter", shelter.id, { name: shelter.name });
  return shelter;
}

export async function updateShelter(repo: Repository, actor: Actor, id: string, patch: Partial<ShelterInput>) {
  const s = await repo.get("shelters", id);
  if (!s) throw notFound("Albergue no encontrado");
  assertShelterAccess(actor, id);
  const changes: Record<string, unknown> = {};
  const { contactName, contactPhone, ...rest } = patch;
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if ((s as unknown as Record<string, unknown>)[k] !== v) {
      changes[k] = { from: (s as unknown as Record<string, unknown>)[k], to: v };
      (s as unknown as Record<string, unknown>)[k] = v;
    }
  }
  if (patch.departmentCode) {
    const d = DEPT_BY_CODE.get(patch.departmentCode);
    if (!d) throw badRequest("Departamento inválido");
    s.department = d.name;
  }
  if (contactName !== undefined || contactPhone !== undefined) {
    s.contact = { name: contactName ?? s.contact?.name ?? "", phone: contactPhone ?? s.contact?.phone ?? "" };
    changes.contact = "actualizado";
  }
  if (s.occupants > s.capacity) throw badRequest("La ocupación no puede superar la capacidad máxima");
  // Cualquier cambio de ubicación o identidad vuelve a requerir verificación para albergues no simulados.
  if (!s.is_simulated && actor.role !== "admin" && ("lat" in changes || "lng" in changes || "ubigeo" in changes || "name" in changes)) {
    s.verified = false;
    s.status = "pending";
  }
  s.dataUpdatedAt = s.updatedAt = nowIso();
  await repo.put("shelters", s);
  await repo.put("shelterHistory", { id: newId("his"), createdAt: s.updatedAt, updatedAt: s.updatedAt, shelterId: id, actorId: actor.id, changes });
  await audit(repo, actor.id, "shelter.update", "shelter", id, changes);
  return s;
}

export async function verifyShelter(repo: Repository, actor: Actor, id: string, decision: "verify" | "reject" | "deactivate" | "historical") {
  if (actor.role !== "admin") throw forbidden("Solo un administrador verifica albergues");
  const s = await repo.get("shelters", id);
  if (!s) throw notFound("Albergue no encontrado");
  const at = nowIso();
  if (decision === "verify") {
    if (s.is_simulated) throw conflict("Un albergue simulado no puede marcarse como verificado");
    s.verified = true;
    s.status = "active";
    s.last_verified_at = at;
    if (s.coordinatorId) {
      const u = await repo.get("users", s.coordinatorId);
      if (u && u.role === "donor") {
        u.role = "shelter_coordinator";
        u.shelterId = s.id;
        u.updatedAt = at;
        await repo.put("users", u);
      }
    }
  } else if (decision === "reject" || decision === "deactivate") {
    s.verified = false;
    s.status = "inactive";
  } else {
    s.verified = false;
    s.status = "historical";
  }
  s.updatedAt = at;
  await repo.put("shelters", s);
  await audit(repo, actor.id, `shelter.${decision}`, "shelter", id);
  return s;
}

export async function setInventory(repo: Repository, actor: Actor, shelterId: string, product: string, quantity: number, unit: string) {
  assertShelterAccess(actor, shelterId);
  if (!PRODUCT_BY_KEY.has(product)) throw badRequest("Producto desconocido");
  const s = await repo.get("shelters", shelterId);
  if (!s) throw notFound("Albergue no encontrado");
  const at = nowIso();
  const existing = (await repo.list("inventory", (i) => i.shelterId === shelterId && i.product === product))[0];
  const item: InventoryItem = existing ? { ...existing, quantity, unit, updatedAt: at } : { id: newId("inv"), createdAt: at, updatedAt: at, shelterId, product, quantity, unit };
  await repo.put("inventory", item);
  s.dataUpdatedAt = s.updatedAt = at;
  await repo.put("shelters", s);
  await repo.put("shelterHistory", { id: newId("his"), createdAt: at, updatedAt: at, shelterId, actorId: actor.id, changes: { [`inventario.${product}`]: { from: existing?.quantity ?? null, to: quantity } } });
  await audit(repo, actor.id, "inventory.set", "shelter", shelterId, { product, quantity });
  return item;
}

export async function setOccupancy(repo: Repository, actor: Actor, shelterId: string, occupants: number, families: number) {
  return updateShelter(repo, actor, shelterId, { occupants, families });
}

/** Registra necesidades ya aprobadas por el coordinador. Cantidad nula = pendiente de confirmación (no entra al optimizador). */
export async function submitNeeds(repo: Repository, actor: Actor, shelterId: string, needs: NeedInput[], meta: { occupants?: number }) {
  assertShelterAccess(actor, shelterId);
  const s = await repo.get("shelters", shelterId);
  if (!s) throw notFound("Albergue no encontrado");
  const at = nowIso();
  const out: ShelterNeed[] = [];
  for (const n of needs) {
    const def = PRODUCT_BY_KEY.get(n.product);
    if (!def || def.category !== n.category) throw badRequest(`Producto/categoría inconsistentes: ${n.product}`);
    if (def.medicine) throw badRequest("Las necesidades de medicamentos se gestionan por el flujo validado");
    const need: ShelterNeed = {
      id: newId("need"), createdAt: at, updatedAt: at, shelterId, category: n.category, product: n.product, quantity: n.quantity,
      fulfilled: 0, reserved: 0, unit: n.unit, urgency: n.urgency,
      status: n.quantity === null ? "pending" : actor.role === "admin" || actor.role === "shelter_coordinator" ? "validated" : "pending",
      notes: n.notes, ...userProvenance("Solicitud del coordinador"),
    };
    await repo.put("needs", need);
    out.push(need);
  }
  if (meta.occupants !== undefined) {
    s.occupants = Math.min(meta.occupants, s.capacity);
  }
  s.dataUpdatedAt = s.updatedAt = at;
  await repo.put("shelters", s);
  await audit(repo, actor.id, "needs.submit", "shelter", shelterId, { count: out.length });
  return out;
}

export async function setNeedStatus(repo: Repository, actor: Actor, needId: string, status: "validated" | "closed" | "draft" | "pending") {
  const n = await repo.get("needs", needId);
  if (!n) throw notFound("Necesidad no encontrada");
  assertShelterAccess(actor, n.shelterId);
  if (status === "validated" && n.quantity === null) throw conflict("Confirma la cantidad antes de validar la necesidad");
  n.status = status;
  n.updatedAt = nowIso();
  await repo.put("needs", n);
  await audit(repo, actor.id, "need.status", "need", needId, { status });
  return n;
}

export async function confirmNeedQuantity(repo: Repository, actor: Actor, needId: string, quantity: number) {
  const n = await repo.get("needs", needId);
  if (!n) throw notFound("Necesidad no encontrada");
  assertShelterAccess(actor, n.shelterId);
  n.quantity = quantity;
  n.status = "validated";
  n.updatedAt = nowIso();
  await repo.put("needs", n);
  return n;
}
