/**
 * Reinicia los datos de DEMOSTRACIÓN (simulados). Conserva los datos oficiales importados por ETL.
 * Uso: npm run seed            (local, archivo data/local/db.json)
 *      STORAGE=dynamo DYNAMO_TABLE=<tabla> DEMO_PASSWORD=<clave> npm run seed
 */
import { createRepository } from "../src/server/container";
import { seedDemo, DEMO_USERS } from "../src/server/seed/seed";

async function main() {
  if (process.env.STORAGE === "dynamo" && !process.env.DEMO_PASSWORD) {
    throw new Error("En DynamoDB define DEMO_PASSWORD (no uses la contraseña pública de desarrollo).");
  }
  const repo = createRepository();
  const r = await seedDemo(repo);
  (repo as { flush?: () => void }).flush?.();
  console.log(`Datos de demostración listos: ${r.shelters} albergues simulados, ${r.users} usuarios.`);
  console.log("Cuentas:", DEMO_USERS.map((u) => u.email).join(", "));
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
