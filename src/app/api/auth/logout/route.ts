import { api } from "@/server/http";
import { sessionCookie } from "@/server/lib/auth";

export const POST = api(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": sessionCookie("", true) } }));
