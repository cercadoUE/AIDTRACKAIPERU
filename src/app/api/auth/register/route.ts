import { api, body } from "@/server/http";
import { registerInput } from "@/server/domain/schemas";
import { hashPassword, sessionCookie, signSession } from "@/server/lib/auth";
import { conflict } from "@/server/lib/errors";
import { newId, nowIso } from "@/server/lib/ids";
import { audit } from "@/server/services/common";

/** El autorregistro SIEMPRE crea un donante. Los demás roles los asigna un administrador. */
export const POST = api(
  async (req, _ctx, repo) => {
    const input = await body(req, registerInput);
    const exists = (await repo.list("users", (u) => u.email.toLowerCase() === input.email.toLowerCase()))[0];
    if (exists) throw conflict("Ya existe una cuenta con ese correo");
    const at = nowIso();
    const user = { id: newId("usr"), createdAt: at, updatedAt: at, email: input.email.toLowerCase(), name: input.name, role: "donor" as const, passwordHash: await hashPassword(input.password) };
    await repo.put("users", user);
    await audit(repo, user.id, "auth.register", "user", user.id);
    return new Response(JSON.stringify({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }), {
      status: 201,
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(await signSession(user)) },
    });
  },
  { limit: [5, 60_000], key: "register" },
);
