# AIDTRACK AI PERÚ: convenciones del proyecto

## Equipo y contexto
Equipo T062 de la Kiro IAthon (`TEAM_ID=T062`, devuelto por `GET /health`). Proyecto construido con Spec-Driven Development de Kiro: la spec vive en `.kiro/specs/aidtrack/` y `tasks.md` se actualiza solo con evidencia (prueba o código). Región AWS: us-east-1.

## Producto
Plataforma de donaciones humanitarias para Perú. Flujo central: el donante describe su donación (texto, voz o formulario) → Amazon Bedrock la interpreta → el usuario confirma → MILP (HiGHS) recomienda albergues → coordinación logística aprueba → envío → el albergue confirma la recepción con código de 6 dígitos.

## Stack
- Next.js 16 (App Router), TypeScript estricto, Tailwind v4, TanStack Query, React Hook Form + Zod, Leaflet, Recharts.
- Servidor: Route Handlers en `src/app/api/**` envueltos con `api()` de `src/server/http.ts` (rate limit, siembra y errores JSON).
- Dominio en `src/server/services/*`; puertos en `src/server/ports`; adaptadores en `src/server/adapters` (memoria, archivo, DynamoDB).
- IA en `src/server/ai`: `provider.ts` (Converse, reintentos ante throttling, respaldo por reglas), `assistant.ts` (tool use sobre consultas a la base).
- AWS: Lambda ARM64 + Lambda Web Adapter + Function URL, DynamoDB de tabla única (`pk = T#<tabla>`, `sk = id`), Secrets Manager, Bedrock `us.anthropic.claude-haiku-4-5-20251001-v1:0`. IaC en `infra/` (CDK).
- Contratos públicos de la IAthon: `/health`, `/items`, `/items/{id}`, `/jobs`, `/jobs/{jobId}` (`src/server/services/public-contract.ts`).

## Nombres
- Código e identificadores en inglés; textos de interfaz y mensajes de error en español.
- Folios: `DON-AAAA-NNNNNN` (donaciones) y `ENV-AAAA-NNNNNN` (envíos). Productos con clave de catálogo (`agua_potable`, `frazadas`…) y unidad canónica del catálogo.

## Cómo probar
- `npm test` (Vitest: unitarias, e2e del flujo, contratos públicos, Bedrock simulado). `npm run typecheck` y `npm run lint` deben quedar en 0 errores.
- `npm run smoke` con `BASE=<url>` recorre el flujo completo por HTTP contra un servidor real.
- `npm run check:bedrock` y `npm run check:dynamo` prueban la integración real (requieren credenciales).

## Qué NO hacer
- No guardar credenciales ni `.env.local` en el repositorio; las credenciales AWS van en el entorno o en el rol de la Lambda.
- No presentar datos simulados como reales: todo dato de demostración lleva `is_simulated: true` y la etiqueta SIMULADO.
- No usar los damnificados históricos de SINPAD como ocupación actual de un albergue.
- No registrar cantidades ambiguas sin confirmación del usuario ni asignar medicamentos automáticamente.
- No confiar en controles del frontend: toda autorización va en el servidor (`requireRole`, `assertShelterAccess`).
- No escribir credenciales, ni siquiera de demostración, en README, specs ni documentación.
- No usar datos personales reales (nombres, correos, teléfonos) en semillas, pruebas ni ejemplos.
