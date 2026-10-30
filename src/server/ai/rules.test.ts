import { describe, expect, it } from "vitest";
import { parseDonationRules, parseNeedsRules } from "./rules";
import { wordsToNumber } from "./numbers";

describe("números en español", () => {
  it("convierte palabras", () => {
    expect(wordsToNumber(["cien"])).toBe(100);
    expect(wordsToNumber(["cincuenta"])).toBe(50);
    expect(wordsToNumber(["treinta", "y", "cinco"])).toBe(35);
    expect(wordsToNumber(["ciento", "veinte"])).toBe(120);
    expect(wordsToNumber(["dos", "mil"])).toBe(2000);
    expect(wordsToNumber(["hola"])).toBeNull();
  });
});

describe("parser de donaciones por reglas", () => {
  it("extrae el ejemplo del enunciado (texto)", () => {
    const r = parseDonationRules("Tengo 50 litros de agua, 30 kilos de arroz, 20 frazadas y 15 kits de higiene. Estoy en Lima y quiero ayudar a los albergues que más lo necesitan.");
    const by = Object.fromEntries(r.donations.map((d) => [d.product, d]));
    expect(by.agua_potable).toMatchObject({ category: "agua", quantity: 50, unit: "litros", needsConfirmation: false });
    expect(by.arroz).toMatchObject({ category: "alimentos", quantity: 30, unit: "kg" });
    expect(by.frazadas).toMatchObject({ category: "abrigo", quantity: 20, unit: "unidades" });
    expect(by.kit_higiene).toMatchObject({ category: "higiene", quantity: 15, unit: "kits" });
    expect(r.donations).toHaveLength(4);
    expect(r.location).toBe("LIMA");
    expect(r.departmentCode).toBe("15");
  });

  it("interpreta cantidades dichas en voz y marca la unidad ambigua", () => {
    const r = parseDonationRules("Tengo cien botellas de agua y cincuenta paquetes de arroz para donar.");
    const agua = r.donations.find((d) => d.product === "agua_potable")!;
    expect(agua.quantity).toBe(100);
    expect(agua.needsConfirmation).toBe(true); // botellas ≠ litros: debe confirmarse
    const arroz = r.donations.find((d) => d.product === "arroz")!;
    expect(arroz.quantity).toBe(50);
    expect(arroz.needsConfirmation).toBe(true); // paquetes ≠ kg
  });

  it("no inventa cantidades vagas o ausentes", () => {
    const r = parseDonationRules("Quiero donar unas frazadas y arroz");
    expect(r.donations.every((d) => d.quantity === null && d.needsConfirmation)).toBe(true);
  });

  it("avisa cuando no reconoce productos", () => {
    const r = parseDonationRules("Hola, quiero ayudar");
    expect(r.donations).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("marca medicamentos como categoría separada", () => {
    const r = parseDonationRules("Tengo 20 paracetamol");
    expect(r.donations[0]).toMatchObject({ product: "medicamentos", category: "medicamentos" });
  });
});

describe("parser de necesidades por reglas", () => {
  it("interpreta la solicitud del enunciado", () => {
    const r = parseNeedsRules("Tenemos 200 personas alojadas. Solo contamos con agua para un día y necesitamos 100 mantas.");
    expect(r.occupants).toBe(200);
    expect(r.autonomyDays).toBe(1);
    const mantas = r.needs.find((n) => n.product === "frazadas")!;
    expect(mantas.quantity).toBe(100);
    const agua = r.needs.find((n) => n.product === "agua_potable")!;
    expect(agua.quantity).toBeNull(); // existencia, no solicitud: cantidad pendiente de confirmar
    expect(agua.needsConfirmation).toBe(true);
  });
});
