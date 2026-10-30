import type { Repository } from "../ports/repository";
import type { Provenance } from "../domain/types";
import { newId, nowIso } from "../lib/ids";

export async function audit(repo: Repository, actorId: string, action: string, entity: string, entityId: string, detail?: unknown) {
  const at = nowIso();
  await repo.put("audit", { id: newId("aud"), createdAt: at, updatedAt: at, at, actorId, action, entity, entityId, detail });
}

export function userProvenance(name = "Registro de usuario en AIDTRACK"): Provenance {
  return { source_type: "user", source_name: name, imported_at: nowIso(), last_verified_at: null, is_simulated: false };
}
