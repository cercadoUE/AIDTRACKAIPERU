import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import type { Repository } from "../ports/repository";
import { ConditionFailedError } from "../ports/repository";
import type { Donation, DonationStatus, Shipment, ShipmentStatus } from "../domain/types";
import type { Actor } from "../lib/auth";
import { assertShelterAccess } from "../lib/auth";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { folio, newId, nowIso, randomCode6, safeEqualHex, sha256 } from "../lib/ids";
import { audit } from "./common";

const ORDER: ShipmentStatus[] = ["approved", "prepared", "dispatched", "in_transit", "delivered", "received"];
export const STATUS_LABEL: Record<string, string> = {
  registered: "Registrada", validated: "Validada", assigned: "Asignada", approved: "Aprobada", prepared: "Preparada",
  dispatched: "Despachada", in_transit: "En transporte", delivered: "Entregada", received: "Recepción confirmada",
};

/** Crea un envío por albergue a partir de asignaciones aprobadas. Devuelve el código de confirmación UNA sola vez. */
export async function createShipments(repo: Repository, actor: Actor, donationId: string) {
  const donation = await repo.get("donations", donationId);
  if (!donation) throw notFound("Donación no encontrada");
  const existing = await repo.list("shipments", (s) => s.donationId === donationId);
  if (existing.length) throw conflict("Ya existen envíos para esta donación");
  const allocs = await repo.list("allocations", (a) => a.donationId === donationId && a.status === "approved");
  if (!allocs.length) throw conflict("No hay asignaciones aprobadas");
  const byShelter = new Map<string, string[]>();
  for (const a of allocs) byShelter.set(a.shelterId, [...(byShelter.get(a.shelterId) ?? []), a.id]);
  const out: { shipment: Shipment; confirmationCode: string }[] = [];
  const at = nowIso();
  for (const [shelterId, allocationIds] of byShelter) {
    const n = await repo.nextCounter(`ENV-${new Date().getFullYear()}`);
    const code = randomCode6();
    const shipment: Shipment = {
      id: newId("shp"), createdAt: at, updatedAt: at, code: folio("ENV", n), donationId, shelterId, allocationIds,
      status: "approved", confirmationCodeHash: "", qrToken: randomBytes(18).toString("base64url"), confirmedCount: 0,
    };
    const salt = randomBytes(8).toString("hex");
    shipment.confirmationCodeHash = `${salt}:${sha256(`${salt}:${code}`)}`;
    await repo.put("shipments", shipment);
    await event(repo, shipment.id, actor, "Envío creado", null, "approved", Object.fromEntries(allocs.filter((a) => a.shelterId === shelterId).map((a) => [a.product, a.quantity])));
    out.push({ shipment: publicShipment(shipment), confirmationCode: code });
  }
  await audit(repo, actor.id, "shipment.create", "donation", donationId, { shipments: out.map((o) => o.shipment.code) });
  return out;
}

export function publicShipment(s: Shipment): Shipment {
  return { ...s, confirmationCodeHash: "" };
}

async function event(repo: Repository, shipmentId: string, actor: Actor | { id: string; role: "system" }, action: string, from: string | null, to: string, quantities?: Record<string, number>, notes?: string) {
  const at = nowIso();
  await repo.put("shipmentEvents", {
    id: newId("evt"), createdAt: at, updatedAt: at, shipmentId, at, action, actorId: actor.id, actorRole: actor.role, from, to, quantities, notes,
  });
}

/** Avanza el estado logístico (prepared → dispatched → in_transit → delivered). La recepción solo se hace con confirmReceipt. */
export async function advanceShipment(repo: Repository, actor: Actor, shipmentId: string, to: ShipmentStatus, notes?: string) {
  if (actor.role !== "logistics" && actor.role !== "admin") throw forbidden("Solo coordinación logística puede actualizar el estado del envío");
  if (to === "received") throw badRequest("La recepción solo se confirma con el código por el coordinador del albergue");
  const s = await repo.get("shipments", shipmentId);
  if (!s) throw notFound("Envío no encontrado");
  const from = s.status;
  if (ORDER.indexOf(to) !== ORDER.indexOf(from) + 1) throw conflict(`Transición inválida: ${from} → ${to}`);
  s.status = to;
  s.updatedAt = nowIso();
  await repo.put("shipments", s);
  await event(repo, s.id, actor, `Estado actualizado a ${STATUS_LABEL[to]}`, from, to, undefined, notes);
  await syncDonationStatus(repo, s.donationId);
  await audit(repo, actor.id, "shipment.advance", "shipment", s.id, { from, to });
  return publicShipment(s);
}

/**
 * Confirmación de recepción. Requiere: sesión de coordinador del albergue destino, envío en estado
 * "delivered" y el código de 6 dígitos. El QR por sí solo no confirma nada. No se puede repetir.
 */
export async function confirmReceipt(repo: Repository, actor: Actor, shipmentId: string, code: string, notes?: string) {
  const s = await repo.get("shipments", shipmentId);
  if (!s) throw notFound("Envío no encontrado");
  assertShelterAccess(actor, s.shelterId);
  if (actor.role !== "shelter_coordinator") throw forbidden("Solo el coordinador del albergue destino confirma la recepción");
  if (s.status === "received") throw conflict("La recepción ya fue confirmada");
  if (s.status !== "delivered") throw conflict("El envío aún no figura como entregado");
  const [salt, hash] = s.confirmationCodeHash.split(":");
  if (!safeEqualHex(sha256(`${salt}:${code}`), hash)) {
    await audit(repo, actor.id, "shipment.confirm_failed", "shipment", s.id);
    throw forbidden("Código de confirmación incorrecto");
  }
  // Marca atómica de "ya confirmado" para evitar doble procesamiento concurrente.
  try {
    await repo.adjust("shipments", s.id, "confirmedCount", 1, { max: 1 });
  } catch (e) {
    if (e instanceof ConditionFailedError) throw conflict("La recepción ya fue confirmada");
    throw e;
  }
  const allocs = await repo.list("allocations", (a) => s.allocationIds.includes(a.id));
  const at = nowIso();
  for (const a of allocs) {
    await repo.adjust("needs", a.needId, "reserved", -a.quantity, { min: 0 });
    await repo.adjust("needs", a.needId, "fulfilled", a.quantity);
    const need = await repo.get("needs", a.needId);
    if (need) {
      const done = need.quantity !== null && need.fulfilled >= need.quantity;
      need.status = done ? "fulfilled" : "partial";
      need.updatedAt = at;
      await repo.put("needs", need);
    }
    const inv = (await repo.list("inventory", (i) => i.shelterId === s.shelterId && i.product === a.product))[0];
    if (inv) await repo.adjust("inventory", inv.id, "quantity", a.quantity);
    else await repo.put("inventory", { id: newId("inv"), createdAt: at, updatedAt: at, shelterId: s.shelterId, product: a.product, quantity: a.quantity, unit: a.unit });
  }
  const fresh = (await repo.get("shipments", s.id))!;
  fresh.status = "received";
  fresh.receivedAt = at;
  fresh.receivedBy = actor.id;
  fresh.updatedAt = at;
  await repo.put("shipments", fresh);
  await event(repo, s.id, actor, "Recepción confirmada por el albergue", "delivered", "received", Object.fromEntries(allocs.map((a) => [a.product, a.quantity])), notes);
  await syncDonationStatus(repo, s.donationId);
  await audit(repo, actor.id, "shipment.receive", "shipment", s.id);
  return publicShipment(fresh);
}

async function syncDonationStatus(repo: Repository, donationId: string) {
  const d = await repo.get("donations", donationId);
  if (!d) return;
  const ships = await repo.list("shipments", (s) => s.donationId === donationId);
  if (!ships.length) return;
  const min = Math.min(...ships.map((s) => ORDER.indexOf(s.status)));
  d.status = ORDER[min] as DonationStatus;
  d.updatedAt = nowIso();
  await repo.put("donations", d);
}

export async function qrFor(baseUrl: string, shipment: Shipment): Promise<string> {
  return QRCode.toDataURL(`${baseUrl}/seguimiento/${shipment.qrToken}`, { margin: 1, width: 220 });
}

export async function timeline(repo: Repository, donation: Donation) {
  const ships = await repo.list("shipments", (s) => s.donationId === donation.id);
  const ids = new Set([`don:${donation.id}`, ...ships.map((s) => s.id)]);
  const events = await repo.list("shipmentEvents", (e) => ids.has(e.shipmentId));
  return { shipments: ships.map(publicShipment), events: events.sort((a, b) => a.at.localeCompare(b.at)) };
}
