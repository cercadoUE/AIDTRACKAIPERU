import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../adapters/memory-repository";
import { importSinpad } from "./sinpad";
import { importUbigeo } from "./ubigeo";
import { decodeBuffer, detectDelimiter, inspectCsv } from "./csv";
import { resolveDepartment } from "../services/geo";

const enc = (s: string) => Buffer.from(s, "latin1");
const SINPAD_HEADER = "CODIGO DE EMERGENCIA-SINPAD;FECHA  DE LA EMER;AÑO;MES;COD. DISTRITO;DPTO.;PROV.;DIST.;PELIGRO;TIPO DE PELIGRO;REGIÓN NATURAL;FALLECIDOS;DESAPARECIDOS;LESIONADOS;DAMNIFICADOS;AFECTADOS";
const row = (code: string, date: string, year: string, ubigeo: string, hazard = "LLUVIA INTENSA", dam = "3", aff = "10") =>
  `${code};${date};${year};FEBRERO;${ubigeo};PIURA;PIURA;CASTILLA;${hazard};ORIGEN NATURAL;COSTA;0;0;0;${dam};${aff}`;

describe("utilidades CSV", () => {
  it("detecta delimitador y codificación", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(decodeBuffer(enc("AÑO")).encoding).toBe("windows-1252");
    expect(decodeBuffer(Buffer.from("AÑO", "utf8")).encoding).toBe("utf-8");
    const i = inspectCsv(enc("COD;AÑO\r\n1;2003\r\n"));
    expect(i.columns).toEqual(["COD", "AÑO"]);
    expect(i.rowCount).toBe(1);
  });
});

describe("ETL SINPAD", () => {
  const csv = [
    SINPAD_HEADER,
    row("1", "11/02/2003", "2003", "200101"),
    row("1", "11/02/2003", "2003", "200101"), // duplicado
    row("2", "05/06/2003", "2003", "200102", "HUAYCO", "5", "20"),
    row("3", "02/15/25", "2025", "200101"), // formato mm/dd/aa válido de 2025
    row("4", "99/99/2003", "2003", "200101"), // fecha imposible
    row("5", "11/02/2003", "2003", "20"), // ubigeo inválido
    row("6", "11/02/2003", "2003", "990101"), // departamento desconocido
    row("7", "11/02/2003", "2003", "200101", "LLUVIA INTENSA", "-4"), // negativo
    row("8", "11/02/2003", "2010", "200101"), // año contradictorio
  ].join("\r\n");

  it("valida, normaliza, deduplica y reporta", async () => {
    const repo = new MemoryRepository();
    const r = await importSinpad(repo, enc(csv));
    expect(r.totalRows).toBe(9);
    expect(r.accepted).toBe(3); // 1, 2 y 3
    expect(r.duplicates).toBe(1);
    expect(r.rejected).toBe(5);
    expect(r.summary.fechasNormalizadas).toBe(1);
    expect(r.errors.map((e) => e.reason).join("|")).toMatch(/Fecha inválida|UBIGEO inválido|Departamento desconocido|numérico/);
    const stats = await repo.list("emergencyStats");
    const lluvia2003 = stats.find((s) => s.year === 2003 && s.hazard === "LLUVIA INTENSA")!;
    expect(lluvia2003.events).toBe(1);
    expect(lluvia2003.homeless).toBe(3);
    expect(stats.some((s) => s.year === 2025)).toBe(true);
  });

  it("es idempotente: reimportar no duplica", async () => {
    const repo = new MemoryRepository();
    await importSinpad(repo, enc(csv));
    const a = (await repo.list("emergencyStats")).length;
    const locA = (await repo.list("locations")).length;
    await importSinpad(repo, enc(csv));
    expect((await repo.list("emergencyStats")).length).toBe(a);
    expect((await repo.list("locations")).length).toBe(locA);
    expect((await repo.list("dataSources")).length).toBe(1);
  });

  it("modo validación no persiste nada", async () => {
    const repo = new MemoryRepository();
    await importSinpad(repo, enc(csv), { persist: false });
    expect((await repo.list("emergencyStats")).length).toBe(0);
  });

  it("rechaza un archivo que no es SINPAD", async () => {
    await expect(importSinpad(new MemoryRepository(), enc("a;b\n1;2"))).rejects.toThrow(/no parece SINPAD/);
  });

  it("unifica Lima Metropolitana y Provincias en el departamento 15", async () => {
    const repo = new MemoryRepository();
    const lima = (code: string, dep: string) => `${code};01/03/2020;2020;MARZO;150101;${dep};LIMA;LIMA;SISMO;ORIGEN NATURAL;COSTA;0;0;0;1;1`;
    await importSinpad(repo, enc([SINPAD_HEADER, lima("a", "LIMA METROPOLITANA"), lima("b", "LIMA PROVINCIAS")].join("\r\n")));
    const stats = await repo.list("emergencyStats");
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ departmentCode: "15", department: "LIMA", events: 2 });
  });
});

describe("ETL UBIGEO", () => {
  const csv = "IDDIST;NOMBDEP;NOMBPROV;NOMBDIST;NOM_CAPITAL (LEGAL);COD_ REG_NAT;REGION NATURAL\r\n010101;AMAZONAS;CHACHAPOYAS;CHACHAPOYAS;X;2;SIERRA\r\n140101;LAMBAYEQUE;CHICLAYO;CHICLAYO;X;1;COSTA\r\n000000;NOTA;AL;PIE;;;\r\n140101;LAMBAYEQUE;CHICLAYO;CHICLAYO;X;1;COSTA\r\n";
  it("importa el catálogo y descarta notas al pie y duplicados", async () => {
    const repo = new MemoryRepository();
    const r = await importUbigeo(repo, enc(csv));
    expect(r.accepted).toBe(2);
    expect(r.rejected).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(await repo.get("locations", "geo_140101")).toMatchObject({ department: "LAMBAYEQUE", province: "CHICLAYO", source: "INEI UBIGEO" });
    await importUbigeo(repo, enc(csv));
    expect((await repo.list("locations")).length).toBe(2);
  });

  it("resuelve ciudades a departamento y no adivina si es ambiguo", async () => {
    const repo = new MemoryRepository();
    await importUbigeo(repo, enc(csv + "010201;AMAZONAS;BAGUA;LA PECA;X;2;SIERRA\r\n130101;LA LIBERTAD;TRUJILLO;TRUJILLO;X;1;COSTA\r\n"));
    expect(await resolveDepartment(repo, "Chiclayo")).toMatchObject({ code: "14", name: "LAMBAYEQUE" });
    expect(await resolveDepartment(repo, "lima")).toMatchObject({ code: "15" });
    expect(await resolveDepartment(repo, "Ciudad Inexistente")).toBeNull();
  });
});

const REAL = path.join(process.cwd(), "data", "raw", "BD_2003-2025_EMERGENCIAS.csv");
describe.skipIf(!fs.existsSync(REAL))("ETL SINPAD con el archivo oficial real", () => {
  it("acepta todas las filas válidas y descarta solo los 7 códigos duplicados", async () => {
    const r = await importSinpad(new MemoryRepository(), fs.readFileSync(REAL), { persist: false });
    expect(r.totalRows).toBe(142139);
    expect(r.rejected).toBe(0);
    expect(r.duplicates).toBe(7);
    expect(r.accepted).toBe(142132);
  });
});
