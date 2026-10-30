import { describe, expect, it } from "vitest";
import { assertFeasible, optimize, solveGreedy, type OptItem, type OptNeed } from "./optimizer";

const item = (stock: number, product = "agua_potable", itemId = "it1"): OptItem => ({ itemId, product, unit: "litros", stock });
const need = (id: string, pending: number, weight: number, distanceKm = 100, product = "agua_potable"): OptNeed => ({ needId: id, shelterId: `s-${id}`, product, pending, weight, distanceKm });

describe("optimizer MILP", () => {
  it("prioriza la necesidad de mayor peso y no sobreasigna el stock", async () => {
    const r = await optimize([item(50)], [need("a", 40, 3), need("b", 40, 1), need("c", 40, 2)]);
    expect(r.method).toBe("milp");
    const total = r.assignments.reduce((s, a) => s + a.quantity, 0);
    expect(total).toBeLessThanOrEqual(50);
    const qa = r.assignments.find((a) => a.needId === "a")?.quantity ?? 0;
    expect(qa).toBe(40); // la de mayor peso se cubre completa
    expect(r.uncoveredAfter).toBeLessThan(r.uncoveredBefore);
  });

  it("nunca entrega más de lo pendiente", async () => {
    const r = await optimize([item(500)], [need("a", 30, 2), need("b", 20, 1)]);
    for (const a of r.assignments) expect(a.quantity).toBeLessThanOrEqual(a.pending);
    expect(r.assignments.reduce((s, a) => s + a.quantity, 0)).toBe(50);
  });

  it("solo asigna el producto que el albergue necesita", async () => {
    const r = await optimize([item(100)], [need("a", 50, 3, 100, "frazadas"), need("b", 20, 1, 100, "agua_potable")]);
    expect(r.assignments.every((a) => a.product === "agua_potable")).toBe(true);
  });

  it("excluye rutas bloqueadas (distancia infinita)", async () => {
    const r = await optimize([item(100)], [need("a", 50, 5, Infinity), need("b", 50, 1, 10)]);
    expect(r.assignments.find((a) => a.needId === "a")).toBeUndefined();
  });

  it("desempata por distancia a igual prioridad", async () => {
    const r = await optimize([item(30)], [need("lejos", 30, 2, 900), need("cerca", 30, 2, 20)]);
    expect(r.assignments.find((a) => a.needId === "cerca")?.quantity).toBe(30);
  });

  it("usa la heurística de respaldo en problemas grandes y respeta restricciones", async () => {
    const needs = Array.from({ length: 300 }, (_, i) => need(`n${i}`, 10, 1 + (i % 5)));
    const items = [item(1000)];
    const r = await optimize(items, needs);
    expect(r.method).toBe("greedy");
    expect(() => assertFeasible(items, needs, r.assignments)).not.toThrow();
  });

  it("greedy es factible", () => {
    const needs = [need("a", 40, 3), need("b", 40, 1)];
    const r = solveGreedy([item(50)], needs);
    expect(() => assertFeasible([item(50)], needs, r.assignments)).not.toThrow();
  });
});
