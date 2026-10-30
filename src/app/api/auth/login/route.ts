import { api, body } from "@/server/http";
import { loginInput } from "@/server/domain/schemas";
import { sessionCookie, signSession, verifyPassword } from "@/server/lib/auth";
import { unauthorized } from "@/server/lib/errors";
import { audit } from "@/server/services/common";

const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/donar");

export const POST = api(
  async (req, _ctx, repo) => {
    // Respaldo sin JavaScript: formulario HTML nativo (application/x-www-form-urlencoded) con redirección 303.
    const isForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
    let creds: { email: string; password: string };
    let next = "/donar";
    if (isForm) {
      const f = new URLSearchParams(await req.text());
      // Sin JavaScript el campo oculto trae el valor por defecto; la página de origen (/login?next=...) manda.
      let fromReferer: string | null = null;
      try { fromReferer = new URL(req.headers.get("referer") ?? "").searchParams.get("next"); } catch { /* sin referer */ }
      next = safeNext(fromReferer ?? f.get("next"));
      const parsed = loginInput.safeParse({ email: f.get("email") ?? "", password: f.get("password") ?? "" });
      if (!parsed.success) return new Response(null, { status: 303, headers: { location: `/login?error=1&next=${encodeURIComponent(next)}` } });
      creds = parsed.data;
    } else {
      creds = await body(req, loginInput);
    }
    const { email, password } = creds;
    const id = email.toLowerCase();
    const user = (await repo.list("users", (u) => u.email.toLowerCase() === id || u.username?.toLowerCase() === id))[0];
    // Mismo mensaje y trabajo de hash para usuario inexistente o contraseña errónea.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    if (!user || !ok) {
      if (isForm) return new Response(null, { status: 303, headers: { location: `/login?error=1&next=${encodeURIComponent(next)}` } });
      throw unauthorized("Correo o contraseña incorrectos");
    }
    await audit(repo, user.id, "auth.login", "user", user.id);
    const token = await signSession(user);
    if (isForm) return new Response(null, { status: 303, headers: { location: next, "set-cookie": sessionCookie(token) } });
    return new Response(JSON.stringify({ user: { id: user.id, name: user.name, email: user.email, role: user.role, shelterId: user.shelterId } }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(token) },
    });
  },
  { limit: [30, 60_000], key: "login" },
);
