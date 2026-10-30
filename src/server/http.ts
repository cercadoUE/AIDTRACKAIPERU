import { ensureSeeded, getRepo } from "./container";
import { errorResponse, badRequest } from "./lib/errors";
import { rateLimit } from "./lib/rate-limit";
import type { ZodType } from "zod";

const MAX_BODY = 64 * 1024;

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

interface Opts {
  /** Límite por IP: [solicitudes, ventana en ms]. */
  limit?: [number, number];
  key?: string;
}

/** Envuelve un handler: siembra datos locales, aplica rate limit y traduce errores a JSON. */
export function api<C = unknown>(fn: (req: Request, ctx: C, repo: ReturnType<typeof getRepo>) => Promise<Response | object>, opts: Opts = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const [n, w] = opts.limit ?? [120, 60_000];
      rateLimit(`${opts.key ?? new URL(req.url).pathname}:${clientIp(req)}`, n, w);
      await ensureSeeded();
      const out = await fn(req, ctx, getRepo());
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) throw badRequest("Solicitud demasiado grande");
  const text = await req.text();
  if (text.length > MAX_BODY) throw badRequest("Solicitud demasiado grande");
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("JSON inválido");
  }
  return schema.parse(json);
}

export function baseUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${req.headers.get("host") ?? u.host}`;
}
