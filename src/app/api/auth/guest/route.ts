import { api } from "@/server/http";
import { getActor, sessionCookie, signSession } from "@/server/lib/auth";
import { newId, nowIso } from "@/server/lib/ids";
import { audit } from "@/server/services/common";
import type { User } from "@/server/domain/types";

/**
 * Sesión de donante invitado: permite registrar una donación sin crear cuenta.
 * Solo otorga el rol "donor" (sin correo ni contraseña, no puede iniciar sesión después).
 * Si ya hay sesión, la reutiliza.
 */
export const POST = api(
  async (req, _c, repo) => {
    const current = await getActor(req);
    if (current) return { user: current, guest: false };
    const at = nowIso();
    const user: User = { id: newId("usr_guest"), createdAt: at, updatedAt: at, email: "", name: "Donante invitado", role: "donor", passwordHash: "!" };
    await repo.put("users", user);
    await audit(repo, user.id, "auth.guest", "user", user.id);
    return new Response(JSON.stringify({ user: { id: user.id, name: user.name, role: user.role }, guest: true }), {
      status: 201,
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(await signSession(user)) },
    });
  },
  { limit: [20, 60_000], key: "guest" },
);
