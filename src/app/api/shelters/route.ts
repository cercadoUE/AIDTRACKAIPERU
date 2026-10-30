import { api, body } from "@/server/http";
import { requireActor, getActor } from "@/server/lib/auth";
import { shelterInput } from "@/server/domain/schemas";
import { createShelter } from "@/server/services/shelters";
import { shelterViews } from "@/server/services/queries";

export const GET = api(async (req, _c, repo) => {
  const actor = await getActor(req);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
  const dept = url.searchParams.get("department");
  const province = url.searchParams.get("province");
  const district = url.searchParams.get("district");
  const status = url.searchParams.get("status");
  const verified = url.searchParams.get("verified");
  const level = url.searchParams.get("level");
  const category = url.searchParams.get("category");
  let views = await shelterViews(repo, actor);
  if (q) views = views.filter((v) => `${v.shelter.name} ${v.shelter.department} ${v.shelter.province} ${v.shelter.district} ${v.shelter.address}`.toLowerCase().includes(q));
  if (dept) views = views.filter((v) => v.shelter.departmentCode === dept);
  if (province) views = views.filter((v) => v.shelter.province.toLowerCase() === province.toLowerCase());
  if (district) views = views.filter((v) => v.shelter.district.toLowerCase() === district.toLowerCase());
  if (status) views = views.filter((v) => v.shelter.status === status);
  if (verified) views = views.filter((v) => String(v.shelter.verified) === verified);
  if (level) views = views.filter((v) => v.priority.level === level);
  if (category) views = views.filter((v) => v.needs.some((n) => n.category === category));
  return {
    shelters: views.map((v) => ({
      ...v.shelter, priority: { score: v.priority.score, level: v.priority.level, confidence: v.priority.confidence, autonomyDays: v.priority.autonomyDays },
      mainNeed: v.mainNeedLabel, pendingTotal: v.pendingTotal,
    })),
  };
});

export const POST = api(
  async (req, _c, repo) => {
    const actor = await requireActor(req);
    const input = await body(req, shelterInput);
    const shelter = await createShelter(repo, actor, input);
    return Response.json({ shelter }, { status: 201 });
  },
  { limit: [10, 60_000], key: "shelter-create" },
);
