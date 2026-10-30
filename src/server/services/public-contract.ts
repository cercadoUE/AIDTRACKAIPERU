import { z } from "zod";
import type { Repository } from "../ports/repository";
import type { ItemRecord, JobRecord } from "../domain/types";
import { newId, nowIso } from "../lib/ids";

/** Tiempo que tarda un trabajo en quedar listo. El verificador exige menos de 12 s. */
export const JOB_DELAY_MS = 2_000;
export const MAX_LIST = 100;
const MAX_VALUE = 1_000;

export const itemInput = z.object({ value: z.string().min(1, "value es obligatorio").max(MAX_VALUE, `value supera ${MAX_VALUE} caracteres`) });
export const jobInput = z.object({ input: z.string().min(1, "input es obligatorio").max(MAX_VALUE, `input supera ${MAX_VALUE} caracteres`) });

export const healthPayload = () => ({ status: "ok" as const, team: process.env.TEAM_ID ?? "" });

export async function createItem(repo: Repository, value: string) {
  const at = nowIso();
  const item: ItemRecord = { id: newId("item"), createdAt: at, updatedAt: at, value };
  await repo.put("items", item);
  return { id: item.id, value: item.value, createdAt: item.createdAt };
}

export async function getItem(repo: Repository, id: string) {
  const item = await repo.get("items", id);
  return item ? { id: item.id, value: item.value, createdAt: item.createdAt } : null;
}

/** Hasta 100 ítems, los más recientes primero. `repo.list` ya recorre todas las páginas de DynamoDB. */
export async function listItems(repo: Repository) {
  const all = await repo.list("items");
  return all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_LIST)
    .map((i) => ({ id: i.id, value: i.value, createdAt: i.createdAt }));
}

/** Invierte por carácter (puntos de código Unicode, no unidades UTF-16): "abc1" → "1cba". */
export const reverseText = (s: string) => Array.from(s).reverse().join("");

export async function createJob(repo: Repository, input: string, now = Date.now()) {
  const at = new Date(now).toISOString();
  const job: JobRecord = { id: newId("job"), createdAt: at, updatedAt: at, input, status: "queued", output: null, readyAt: new Date(now + JOB_DELAY_MS).toISOString() };
  await repo.put("jobs", job);
  return { jobId: job.id, status: job.status };
}

/** Resuelve el trabajo al leerlo: si ya pasó `readyAt`, calcula el resultado y lo persiste. */
export async function getJob(repo: Repository, jobId: string, now = Date.now()) {
  const job = await repo.get("jobs", jobId);
  if (!job) return null;
  if (job.status === "queued" && now >= new Date(job.readyAt).getTime()) {
    job.status = "done";
    job.output = reverseText(job.input);
    job.updatedAt = new Date(now).toISOString();
    await repo.put("jobs", job);
  }
  return { jobId: job.id, status: job.status, output: job.output, createdAt: job.createdAt };
}
