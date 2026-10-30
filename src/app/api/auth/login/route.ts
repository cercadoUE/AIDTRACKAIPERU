import { api, body } from "@/server/http";
import { loginInput } from "@/server/domain/schemas";
import { sessionCookie, signSession, verifyPassword } from "@/server/lib/auth";
import { unauthorized } from "@/server/lib/errors";
import { audit } from "@/server/services/common";

export const POST = api(
  async (req, _ctx, repo) => {
    const { email, password } = await body(req, loginInput);
    const id = email.toLowerCase();
    const user = (await repo.list("users", (u) => u.email.toLowerCase() === id || u.username?.toLowerCase() === id))[0];
    // Mismo mensaje y trabajo de hash para usuario inexistente o contraseña errónea.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    if (!user || !ok) throw unauthorized("Correo o contraseña incorrectos");
    await audit(repo, user.id, "auth.login", "user", user.id);
    const token = await signSession(user);
    return new Response(JSON.stringify({ user: { id: user.id, name: user.name, email: user.email, role: user.role, shelterId: user.shelterId } }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
    });
  },
  { limit: [10, 60_000], key: "login" },
);
