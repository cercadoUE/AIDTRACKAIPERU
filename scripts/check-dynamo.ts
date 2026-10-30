/**
 * Prueba de integración del adaptador DynamoDB contra una tabla REAL (pk/sk string).
 * Uso: DYNAMO_TABLE=<tabla> npx tsx scripts/check-dynamo.ts
 */
import { DynamoRepository } from "../src/server/adapters/dynamo-repository";
import { ConditionFailedError } from "../src/server/ports/repository";
import type { DonationItem, ShelterNeed } from "../src/server/domain/types";

const table = process.env.DYNAMO_TABLE;
if (!table) throw new Error("Define DYNAMO_TABLE");
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const at = new Date().toISOString();

async function main() {
  const repo = new DynamoRepository(table!);
  const item: DonationItem = { id: "itm_t1", createdAt: at, updatedAt: at, donationId: "d1", category: "agua", product: "agua_potable", quantity: 100, reserved: 0, unit: "litros" };
  await repo.put("donationItems", item);
  check("put/get", (await repo.get("donationItems", "itm_t1"))?.quantity === 100);
  check("list con filtro", (await repo.list("donationItems", (i) => i.donationId === "d1")).length === 1);

  check("adjust dentro del límite", (await repo.adjust("donationItems", "itm_t1", "reserved", 60, { max: 100 })) === 60);
  let rejected = false;
  try { await repo.adjust("donationItems", "itm_t1", "reserved", 50, { max: 100 }); } catch (e) { rejected = e instanceof ConditionFailedError; }
  check("adjust que excede el máximo es rechazado", rejected);
  check("el valor no cambió tras el rechazo", (await repo.get("donationItems", "itm_t1"))?.reserved === 60);
  check("adjust negativo con mínimo", (await repo.adjust("donationItems", "itm_t1", "reserved", -60, { min: 0 })) === 0);
  rejected = false;
  try { await repo.adjust("donationItems", "itm_t1", "reserved", -1, { min: 0 }); } catch (e) { rejected = e instanceof ConditionFailedError; }
  check("adjust por debajo del mínimo es rechazado", rejected);
  rejected = false;
  try { await repo.adjust("donationItems", "no_existe", "reserved", 1); } catch (e) { rejected = e instanceof ConditionFailedError; }
  check("adjust sobre registro inexistente es rechazado", rejected);

  // Carrera: 20 reservas simultáneas de 10 sobre un stock de 100 → exactamente 10 deben ganar.
  const need: ShelterNeed = { id: "need_t1", createdAt: at, updatedAt: at, shelterId: "s1", category: "agua", product: "agua_potable", quantity: 100, fulfilled: 0, reserved: 0, unit: "litros", urgency: "high", status: "validated", source_type: "user", source_name: "t", imported_at: at, is_simulated: true };
  await repo.put("needs", need);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => repo.adjust("needs", "need_t1", "reserved", 10, { max: 100 })));
  const won = results.filter((r) => r.status === "fulfilled").length;
  const final = (await repo.get("needs", "need_t1"))!.reserved;
  check("20 reservas concurrentes: ganan exactamente 10", won === 10, `ganaron ${won}`);
  check("el total reservado nunca supera el máximo", final === 100, `reservado ${final}`);

  const counters = await Promise.all(Array.from({ length: 10 }, () => repo.nextCounter("DON-TEST")));
  check("contador atómico sin repetidos", new Set(counters).size === 10 && Math.min(...counters) === 1 && Math.max(...counters) === 10, counters.sort((a, b) => a - b).join(","));

  await repo.remove("donationItems", "itm_t1");
  check("remove", (await repo.get("donationItems", "itm_t1")) === null);
  await repo.clearAll();
  check("clearAll vacía la tabla", (await repo.list("needs")).length === 0);
  console.log(failures ? `\n${failures} FALLARON` : "\nTodas las verificaciones DynamoDB pasaron");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error("ERROR:", e.name, e.message); process.exit(1); });
