import type { Repository } from "./ports/repository";
import { FileRepository } from "./adapters/file-repository";
import { MemoryRepository } from "./adapters/memory-repository";
import { DynamoRepository } from "./adapters/dynamo-repository";

type G = typeof globalThis & { __aidtrackRepo?: Repository; __aidtrackSeeded?: Promise<void> };
const g = globalThis as G;

export function createRepository(): Repository {
  const mode = process.env.STORAGE ?? "file";
  if (mode === "dynamo") {
    const table = process.env.DYNAMO_TABLE;
    if (!table) throw new Error("STORAGE=dynamo requiere DYNAMO_TABLE");
    return new DynamoRepository(table);
  }
  if (mode === "memory") return new MemoryRepository();
  return new FileRepository();
}

/** Repositorio singleton (sobrevive al hot reload de Next en desarrollo). */
export function getRepo(): Repository {
  if (!g.__aidtrackRepo) g.__aidtrackRepo = createRepository();
  return g.__aidtrackRepo;
}

/** Sustituye el repositorio (pruebas). */
export function setRepo(repo: Repository | undefined) {
  g.__aidtrackRepo = repo;
  g.__aidtrackSeeded = undefined;
}

/** Carga datos de demostración la primera vez si la base está vacía. */
export async function ensureSeeded(): Promise<void> {
  if (!g.__aidtrackSeeded) {
    g.__aidtrackSeeded = (async () => {
      // En producción NO se siembran usuarios demo salvo que se pida explícitamente (AUTO_SEED=1):
      // evita dejar cuentas con contraseñas conocidas en un entorno público.
      if (process.env.NODE_ENV === "production" && process.env.AUTO_SEED !== "1") return;
      const repo = getRepo();
      const users = await repo.list("users");
      if (users.length === 0) {
        const { seedDemo } = await import("./seed/seed");
        await seedDemo(repo);
      }
    })();
    g.__aidtrackSeeded.catch(() => {
      g.__aidtrackSeeded = undefined;
    });
  }
  return g.__aidtrackSeeded;
}
