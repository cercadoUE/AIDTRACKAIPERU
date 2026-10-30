import type { Repository } from "../ports/repository";
import { findDepartment, normalizeName } from "../domain/catalog";

/**
 * Resuelve un texto de ubicación ("Lima", "Chiclayo", "Sullana") a un departamento.
 * Primero por nombre de departamento; si no, por provincia o distrito del catálogo UBIGEO (INEI).
 * Si el nombre es ambiguo (existe en varios departamentos) NO adivina y devuelve null.
 */
export async function resolveDepartment(repo: Repository, text: string | null | undefined): Promise<{ code: string; name: string } | null> {
  if (!text) return null;
  const direct = findDepartment(text);
  if (direct) return { code: direct.code, name: direct.name };
  const needle = normalizeName(text);
  if (needle.length < 4) return null;
  const hits = await repo.list("locations", (l) => l.province === needle || l.district === needle);
  const depts = new Map(hits.map((l) => [l.departmentCode, l.department]));
  if (depts.size !== 1) return null;
  const [[code, name]] = [...depts];
  return { code, name };
}
