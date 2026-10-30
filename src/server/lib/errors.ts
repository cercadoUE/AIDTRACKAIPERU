import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, details?: unknown) => new HttpError(400, m, "bad_request", details);
export const unauthorized = (m = "Debes iniciar sesión") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "No tienes permiso para esta acción") => new HttpError(403, m, "forbidden");
export const notFound = (m = "No encontrado") => new HttpError(404, m, "not_found");
export const conflict = (m: string) => new HttpError(409, m, "conflict");
export const tooMany = (m = "Demasiadas solicitudes, intenta en unos segundos") => new HttpError(429, m, "rate_limited");

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    return Response.json({ error: "Datos inválidos", code: "validation", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  console.error("[api] error inesperado", e);
  return Response.json({ error: "Error interno", code: "internal" }, { status: 500 });
}
