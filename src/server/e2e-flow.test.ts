import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "./adapters/memory-repository";
import { seedDemo } from "./seed/seed";
import { parseDonation } from "./ai/provider";
import { donationInput } from "./domain/schemas";
import { createDonation, recommend, approveAllocations } from "./services/donations";
import { createShipments, advanceShipment, confirmReceipt, timeline } from "./services/shipments";
import { computePriority } from "./services/priority";
import type { Actor } from "./lib/auth";
import type { Repository } from "./ports/repository";

let repo: Repository;
const actor = (id: string, role: Actor["role"], shelterId?: string): Actor => ({ id, name: id, email: `${id}@t`, role, shelterId });

beforeEach(async () => {
  process.env.AI_PROVIDER = "rules";
  repo = new MemoryRepository();
  await seedDemo(repo);
});

describe("flujo principal extremo a extremo", () => {
  it("donante → IA → recomendación → aprobación → despacho → recepción", async () => {
    const donor = actor("usr_demo_1", "donor");
    const logistics = actor("usr_demo_4", "logistics");

    // 1) La IA interpreta el texto
    const parsed = await parseDonation("Tengo 50 litros de agua, 30 kilos de arroz, 20 frazadas y 15 kits de higiene. Estoy en Lima.");
    expect(parsed.donations).toHaveLength(4);
    expect(parsed.donations.every((d) => !d.needsConfirmation)).toBe(true);

    // 2) El usuario confirma y se registra (validado con Zod, exige confirmed:true)
    const input = donationInput.parse({
      channel: "text", transportAvailable: true, confirmed: true, departmentCode: parsed.departmentCode ?? undefined,
      items: parsed.donations.map((d) => ({ category: d.category, product: d.product, quantity: d.quantity, unit: d.unit })),
    });
    const { donation, items } = await createDonation(repo, donor, input);
    expect(donation.folio).toMatch(/^DON-\d{4}-\d{6}$/);
    expect(donation.status).toBe("registered");

    // 3) El sistema recomienda (MILP) respetando el stock del donante
    const rec = await recommend(repo, logistics, donation.id);
    expect(rec.allocations.length).toBeGreaterThan(0);
    for (const it of items) {
      const total = rec.allocations.filter((a) => a.itemId === it.id).reduce((s, a) => s + a.quantity, 0);
      expect(total).toBeLessThanOrEqual(it.quantity);
    }
    expect(rec.allocations.every((a) => a.explanation.length > 20)).toBe(true);
    expect((await repo.get("donations", donation.id))!.status).toBe("assigned");

    // 4) Un donante NO puede aprobar; el coordinador logístico sí (lo aplica la capa de rutas, y aquí el servicio reserva)
    const approvedIds = await approveAllocations(repo, logistics, donation.id);
    expect(approvedIds.length).toBe(rec.allocations.length);
    const reservedTotal = (await repo.list("donationItems", (i) => i.donationId === donation.id)).reduce((s, i) => s + i.reserved, 0);
    expect(reservedTotal).toBe(rec.allocations.reduce((s, a) => s + a.quantity, 0));

    // 5) Despacho
    const ships = await createShipments(repo, logistics, donation.id);
    expect(ships.length).toBeGreaterThan(0);
    const { shipment, confirmationCode } = ships[0];
    expect(shipment.confirmationCodeHash).toBe(""); // el hash nunca sale por la API
    for (const st of ["prepared", "dispatched", "in_transit", "delivered"] as const) await advanceShipment(repo, logistics, shipment.id, st);

    // 6) Recepción: coordinador del albergue destino con el código correcto
    const coord = actor("coord", "shelter_coordinator", shipment.shelterId);
    const needsBefore = await repo.list("needs", (n) => n.shelterId === shipment.shelterId);
    await confirmReceipt(repo, coord, shipment.id, confirmationCode);
    const done = (await repo.get("shipments", shipment.id))!;
    expect(done.status).toBe("received");
    const needsAfter = await repo.list("needs", (n) => n.shelterId === shipment.shelterId);
    const fulfilledBefore = needsBefore.reduce((s, n) => s + n.fulfilled, 0);
    expect(needsAfter.reduce((s, n) => s + n.fulfilled, 0)).toBeGreaterThan(fulfilledBefore);

    // 7) Trazabilidad: eventos en orden con actor, estados anterior/nuevo
    const tl = await timeline(repo, (await repo.get("donations", donation.id))!);
    const actions = tl.events.map((e) => e.to);
    expect(actions[0]).toBe("registered");
    expect(actions).toContain("approved");
    expect(actions).toContain("received");
    expect(tl.events.every((e) => e.actorId && e.at)).toBe(true);
  });
});

describe("integridad y seguridad", () => {
  async function prepared() {
    const donor = actor("usr_demo_1", "donor");
    const logistics = actor("usr_demo_4", "logistics");
    const { donation } = await createDonation(repo, donor, donationInput.parse({
      channel: "form", transportAvailable: true, confirmed: true, departmentCode: "20",
      items: [{ category: "agua", product: "agua_potable", quantity: 500, unit: "litros" }],
    }));
    await recommend(repo, logistics, donation.id);
    await approveAllocations(repo, logistics, donation.id);
    const [{ shipment, confirmationCode }] = await createShipments(repo, logistics, donation.id);
    for (const st of ["prepared", "dispatched", "in_transit", "delivered"] as const) await advanceShipment(repo, logistics, shipment.id, st);
    return { donation, shipment, confirmationCode, logistics };
  }

  it("no permite aprobar dos veces la misma asignación (sin doble reserva)", async () => {
    const logistics = actor("usr_demo_4", "logistics");
    const { donation } = await createDonation(repo, actor("usr_demo_1", "donor"), donationInput.parse({
      channel: "form", transportAvailable: true, confirmed: true, departmentCode: "20",
      items: [{ category: "agua", product: "agua_potable", quantity: 300, unit: "litros" }],
    }));
    await recommend(repo, logistics, donation.id);
    await approveAllocations(repo, logistics, donation.id);
    await expect(approveAllocations(repo, logistics, donation.id)).rejects.toThrow();
    const items = await repo.list("donationItems", (i) => i.donationId === donation.id);
    expect(items[0].reserved).toBeLessThanOrEqual(items[0].quantity);
  });

  it("dos donaciones compitiendo por la misma necesidad nunca superan lo pendiente", async () => {
    const logistics = actor("usr_demo_4", "logistics");
    const mkDon = async () => (await createDonation(repo, actor("usr_demo_1", "donor"), donationInput.parse({
      channel: "form", transportAvailable: true, confirmed: true, departmentCode: "20",
      items: [{ category: "agua", product: "agua_potable", quantity: 100000, unit: "litros" }],
    }))).donation;
    const a = await mkDon();
    const b = await mkDon();
    await recommend(repo, logistics, a.id);
    await recommend(repo, logistics, b.id); // ambas proponen sobre las mismas necesidades (nada reservado aún)
    await approveAllocations(repo, logistics, a.id);
    // La segunda debe fallar con conflicto o quedar limitada: jamás exceder lo necesario
    await approveAllocations(repo, logistics, b.id).catch(() => undefined);
    for (const n of await repo.list("needs")) {
      if (n.quantity !== null) expect(n.fulfilled + n.reserved).toBeLessThanOrEqual(n.quantity);
    }
  });

  it("el donante no puede aprobar ni el QR confirma por sí solo: se exige rol, albergue y código", async () => {
    const { shipment, confirmationCode } = await prepared();
    // Otro albergue
    await expect(confirmReceipt(repo, actor("x", "shelter_coordinator", "otro"), shipment.id, confirmationCode)).rejects.toThrow(/administras/);
    // Donante
    await expect(confirmReceipt(repo, actor("usr_demo_1", "donor"), shipment.id, confirmationCode)).rejects.toThrow();
    // Código incorrecto
    const coord = actor("c", "shelter_coordinator", shipment.shelterId);
    await expect(confirmReceipt(repo, coord, shipment.id, "000000")).rejects.toThrow(/incorrecto/);
    expect((await repo.get("shipments", shipment.id))!.status).toBe("delivered");
  });

  it("impide confirmar dos veces la recepción", async () => {
    const { shipment, confirmationCode } = await prepared();
    const coord = actor("c", "shelter_coordinator", shipment.shelterId);
    await confirmReceipt(repo, coord, shipment.id, confirmationCode);
    await expect(confirmReceipt(repo, coord, shipment.id, confirmationCode)).rejects.toThrow(/ya fue confirmada/);
    const needs = await repo.list("needs", (n) => n.shelterId === shipment.shelterId && n.product === "agua_potable");
    for (const n of needs) if (n.quantity !== null) expect(n.fulfilled).toBeLessThanOrEqual(n.quantity);
  });

  it("solo logística puede avanzar estados y no se puede saltar una etapa", async () => {
    const logistics = actor("usr_demo_4", "logistics");
    const { donation } = await createDonation(repo, actor("usr_demo_1", "donor"), donationInput.parse({
      channel: "form", transportAvailable: true, confirmed: true, departmentCode: "20",
      items: [{ category: "agua", product: "agua_potable", quantity: 100, unit: "litros" }],
    }));
    await recommend(repo, logistics, donation.id);
    await approveAllocations(repo, logistics, donation.id);
    const [{ shipment }] = await createShipments(repo, logistics, donation.id);
    await expect(advanceShipment(repo, actor("d", "donor"), shipment.id, "prepared")).rejects.toThrow();
    await expect(advanceShipment(repo, logistics, shipment.id, "delivered")).rejects.toThrow(/Transición inválida/);
    await expect(advanceShipment(repo, logistics, shipment.id, "received")).rejects.toThrow();
  });

  it("medicamentos nunca se asignan automáticamente", async () => {
    const logistics = actor("usr_demo_4", "logistics");
    const { donation } = await createDonation(repo, actor("usr_demo_1", "donor"), donationInput.parse({
      channel: "form", transportAvailable: true, confirmed: true,
      items: [{ category: "medicamentos", product: "medicamentos", quantity: 10, unit: "unidades" }],
    }));
    const rec = await recommend(repo, logistics, donation.id);
    expect(rec.allocations).toHaveLength(0);
    expect(rec.excluded[0].product).toBe("medicamentos");
  });
});

describe("validación de entradas", () => {
  it("rechaza cantidades inválidas y exige confirmación", () => {
    const base = { channel: "form", items: [{ category: "agua", product: "agua_potable", quantity: 10, unit: "litros" }] };
    expect(donationInput.safeParse({ ...base, confirmed: true }).success).toBe(true);
    expect(donationInput.safeParse({ ...base }).success).toBe(false);
    expect(donationInput.safeParse({ ...base, confirmed: true, items: [{ ...base.items[0], quantity: -5 }] }).success).toBe(false);
    expect(donationInput.safeParse({ ...base, confirmed: true, items: [{ ...base.items[0], quantity: 0 }] }).success).toBe(false);
    expect(donationInput.safeParse({ ...base, confirmed: true, items: [{ ...base.items[0], product: "inexistente" }] }).success).toBe(false);
  });
});

describe("prioridad", () => {
  it("un albergue con más agua pero muchas más personas puede estar peor", async () => {
    const shelters = await repo.list("shelters");
    const base = shelters[0];
    const small = { ...base, occupants: 10, dataUpdatedAt: new Date().toISOString() };
    const big = { ...base, occupants: 300, dataUpdatedAt: new Date().toISOString() };
    const mk = (q: number) => [{ id: "i", createdAt: "", updatedAt: "", shelterId: base.id, product: "agua_potable", quantity: q, unit: "litros" }];
    const pSmall = computePriority({ shelter: small, inventory: mk(100), needs: [] });
    const pBig = computePriority({ shelter: big, inventory: mk(500), needs: [] });
    expect(pBig.score!).toBeGreaterThan(pSmall.score!);
    expect(pBig.autonomyDays!).toBeLessThan(pSmall.autonomyDays!);
  });

  it("sin datos suficientes no inventa puntaje alto y baja la confianza", () => {
    return repo.list("shelters").then((s) => {
      const p = computePriority({ shelter: { ...s[0], occupants: 0, vulnerableShare: undefined, accessDifficulty: undefined }, inventory: [], needs: [] });
      expect(p.level).toBe("insufficient");
      expect(p.confidence).toBe("baja");
    });
  });
});
