import { api } from "@/server/http";
import { DEPARTMENTS } from "@/server/domain/catalog";

/** Catálogo territorial UBIGEO: departamentos → provincias → distritos (desde el catálogo oficial importado). */
export const GET = api(async (req, _c, repo) => {
  const u = new URL(req.url);
  const dept = u.searchParams.get("department");
  const province = u.searchParams.get("province");
  if (!dept) return { departments: DEPARTMENTS.map(({ code, name }) => ({ code, name })) };
  const locs = await repo.list("locations", (l) => l.departmentCode === dept);
  if (!province) return { provinces: [...new Map(locs.map((l) => [l.provinceCode, { code: l.provinceCode, name: l.province }])).values()].sort((a, b) => a.name.localeCompare(b.name)) };
  return { districts: locs.filter((l) => l.provinceCode === province).map((l) => ({ ubigeo: l.ubigeo, name: l.district })).sort((a, b) => a.name.localeCompare(b.name)) };
});
