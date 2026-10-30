# Plan de implementación: AIDTRACK AI PERÚ

Cada tarea se cierra solo con `npm test`, `npm run typecheck` y `npm run lint` en verde. Entre paréntesis, la evidencia.

- [x] 1. Base del proyecto, identidad visual y navegación
  - [x] 1.1 Next.js 16 + TypeScript + Tailwind, sidebar, modo oscuro, componentes accesibles (`src/components/ui.tsx`, `app-shell.tsx`)
  - [x] 1.2 Las 17 rutas obligatorias responden 200 (`scripts/smoke-http.mjs`)
- [x] 2. Datos y ETL (R9)
  - [x] 2.1 Tipos de dominio y puerto `Repository` con adaptadores memoria, archivo y DynamoDB (`src/server/adapters`, `scripts/check-dynamo.ts`)
  - [x] 2.2 Importador CSV: codificación, delimitador, validación, deduplicación, reporte e idempotencia (`src/server/etl`, `etl.test.ts`)
  - [x] 2.3 UBIGEO INEI (1891 distritos) y SINPAD INDECI (142132 filas aceptadas, fechas mm/dd/aa de 2025 normalizadas)
- [x] 3. Albergues, inventarios y necesidades (R2, R7)
  - [x] 3.1 CRUD, verificación administrativa, historial de cambios y contactos protegidos (`services/shelters.ts`)
  - [x] 3.2 Necesidades en lenguaje natural con aprobación del coordinador y cantidades pendientes de confirmar
- [x] 4. Donaciones por texto, voz y formulario (R1)
  - [x] 4.1 Parser con Bedrock validado con Zod y respaldo por reglas (`ai/provider.ts`, `bedrock.test.ts`, `rules.test.ts`)
  - [x] 4.2 Voz: Amazon Transcribe con respaldo Web Speech API, sin guardar audio (`donar/voz`, `api/ai/transcribe`)
  - [x] 4.3 Confirmación obligatoria, unidades canónicas y flujo separado de medicamentos
- [x] 5. Priorización y optimización (R3, R4)
  - [x] 5.1 Índice 0–100 con pesos configurables, confianza y explicación (`services/priority.ts`)
  - [x] 5.2 MILP HiGHS + greedy de respaldo, verificación de factibilidad (`optimizer.test.ts`)
  - [x] 5.3 Reserva atómica y condicional sin doble asignación (`e2e-flow.test.ts`, 20 reservas concurrentes en DynamoDB real)
- [x] 6. Mapa, ranking y dashboard (R6)
- [x] 7. Trazabilidad, QR y roles (R5, R8)
  - [x] 7.1 Máquina de estados, eventos, QR de solo lectura, código hasheado, confirmación única
  - [x] 7.2 Autorización en servidor por rol y por albergue
- [x] 8. IA y simulador (R10, R11)
  - [x] 8.1 Asistente con tool use sobre consultas verificables y reintentos ante throttling
  - [x] 8.2 Simulador sobre copia de los datos con comparación antes/después
- [x] 9. Despliegue y verificación
  - [x] 9.1 Infraestructura CDK con pruebas (`infra/test`)
  - [x] 9.2 Despliegue público en Lambda + Function URL + DynamoDB + Secrets Manager (CLI de AWS, porque la cuenta bloquea el bootstrap de CDK)
  - [x] 9.3 Contratos públicos de la IAthon: `/health`, `/items`, `/jobs` (`public-contract.test.ts`)
- [ ] 10. Pendiente
  - [ ] 10.1 Integrar Amazon Cognito en lugar del JWT propio
  - [ ] 10.2 Prueba de extremo a extremo en navegador (consola sin errores)
