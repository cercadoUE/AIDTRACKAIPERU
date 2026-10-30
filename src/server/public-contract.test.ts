import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepository } from "./adapters/memory-repository";
import { setRepo } from "./container";
import { resetRateLimits } from "./lib/rate-limit";
import { createJob, getJob, reverseText, JOB_DELAY_MS } from "./services/public-contract";
import { GET as health } from "@/app/health/route";
import { GET as listItemsRoute, POST as createItemRoute } from "@/app/items/route";
import { GET as getItemRoute } from "@/app/items/[id]/route";
import { POST as createJobRoute } from "@/app/jobs/route";
import { GET as getJobRoute } from "@/app/jobs/[jobId]/route";

const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://test.local${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

let repo: MemoryRepository;
beforeEach(async () => {
  repo = new MemoryRepository();
  // Un usuario existente evita que se siembre la demo completa en cada prueba.
  await repo.put("users", { id: "u", createdAt: "", updatedAt: "", email: "x@test.local", name: "x", role: "donor", passwordHash: "x" });
  setRepo(repo);
  resetRateLimits();
});

describe("API viva", () => {
  it("GET /health responde 200 con status ok y el teamId", async () => {
    process.env.TEAM_ID = "equipo-demo";
    const r = await health(req("/health"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ status: "ok", team: "equipo-demo" });
  });
});

describe("Persistencia", () => {
  it("POST /items crea, GET /items/{id} lo devuelve y GET /items lo lista", async () => {
    const nonce = `n-${Math.random().toString(36).slice(2)}`;
    const created = await createItemRoute(req("/items", "POST", { value: nonce }), undefined);
    expect(created.status).toBe(201);
    const { id, value } = await created.json();
    expect(value).toBe(nonce);
    const one = await getItemRoute(req(`/items/${id}`), ctx({ id }));
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({ id, value: nonce });
    const list = await listItemsRoute(req("/items"), undefined);
    expect((await list.json()).items.some((i: { id: string; value: string }) => i.id === id && i.value === nonce)).toBe(true);
  });

  it("la lista incluye el ítem nuevo aunque haya más de 100", async () => {
    for (let i = 0; i < 120; i++) await repo.put("items", { id: `old${i}`, createdAt: new Date(2020, 0, 1, 0, 0, i).toISOString(), updatedAt: "", value: `v${i}` });
    const { id } = await (await createItemRoute(req("/items", "POST", { value: "nuevo" }), undefined)).json();
    const items = (await (await listItemsRoute(req("/items"), undefined)).json()).items as { id: string }[];
    expect(items).toHaveLength(100);
    expect(items[0].id).toBe(id);
  });

  it("404 si no existe y 400 si falta value", async () => {
    expect((await getItemRoute(req("/items/nada"), ctx({ id: "nada" }))).status).toBe(404);
    expect((await createItemRoute(req("/items", "POST", {}), undefined)).status).toBe(400);
    expect((await createItemRoute(req("/items", "POST", { value: "x".repeat(1001) }), undefined)).status).toBe(400);
  });
});

describe("Asíncrono", () => {
  it("invierte por carácter", () => {
    expect(reverseText("abc1")).toBe("1cba");
    expect(reverseText("ñandú🙂")).toBe("🙂údnañ");
  });

  it("POST /jobs responde 202 con jobId y queda en queued al inicio", async () => {
    const r = await createJobRoute(req("/jobs", "POST", { input: "abc1" }), undefined);
    expect(r.status).toBe(202);
    const { jobId } = await r.json();
    const g = await getJobRoute(req(`/jobs/${jobId}`), ctx({ jobId }));
    expect(await g.json()).toMatchObject({ jobId, status: "queued", output: null });
  });

  it("pasa a done con el input invertido antes de 12 s y lo persiste", async () => {
    const t0 = Date.now();
    const { jobId } = await createJob(repo, "abc1", t0);
    expect(JOB_DELAY_MS).toBeLessThan(12_000);
    expect((await getJob(repo, jobId, t0 + JOB_DELAY_MS))).toMatchObject({ status: "done", output: "1cba" });
    expect((await repo.get("jobs", jobId))?.status).toBe("done");
  });

  it("404 si el trabajo no existe y 400 sin input", async () => {
    expect((await getJobRoute(req("/jobs/nada"), ctx({ jobId: "nada" }))).status).toBe(404);
    expect((await createJobRoute(req("/jobs", "POST", { input: "" }), undefined)).status).toBe(400);
  });
});
