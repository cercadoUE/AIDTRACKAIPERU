import { healthPayload } from "@/server/services/public-contract";

/** Insignia "API viva": pública, sin autenticación y sin tocar la base para responder siempre rápido. */
export async function GET(req: Request) {
  void req; // usar la solicitud mantiene la ruta dinámica (TEAM_ID se lee en tiempo de ejecución)
  return Response.json(healthPayload(), { headers: { "cache-control": "no-store" } });
}
