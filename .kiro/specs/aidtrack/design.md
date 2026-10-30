# Diseño: AIDTRACK AI PERÚ

## Arquitectura

```
Navegador (Next.js App Router, React Query, Leaflet, Recharts)
   │  fetch /api/*  (cookie httpOnly con JWT)
   ▼
Route Handlers (src/app/api/**)  ← validación Zod + authz por rol + rate limit
   │
   ▼
Servicios de dominio (src/server/services/*)
   ├─ priority   índice de necesidad 0–100
   ├─ optimizer  MILP (HiGHS WASM) + greedy de respaldo
   ├─ donations  registro, folio, reserva atómica
   ├─ shipments  máquina de estados, eventos, QR, confirmación
   ├─ etl        importadores CSV (UBIGEO, SINPAD)
   └─ ai         parsers + explicador + asistente (puerto AiProvider)
   │
   ▼
Puertos (src/server/ports) → Adaptadores
   ├─ Repository: FileRepository (local, data/local/db.json)  |  DynamoRepository (AWS)
   ├─ AiProvider: RulesAiProvider (local)  |  BedrockAiProvider (Claude Haiku 4.5)
   ├─ Auth:       LocalJwt (usuarios semilla)  |  Cognito (producción)
   └─ Transcribe: WebSpeech (navegador)  |  Amazon Transcribe Streaming
```

El dominio no importa nada de AWS. La selección de adaptadores se hace por variables de entorno (`STORAGE=file|dynamo`, `AI_PROVIDER=rules|bedrock`).

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Base de datos | DynamoDB en AWS, archivo JSON en local | Docker no está disponible en el entorno de desarrollo. Ambos implementan el mismo puerto `Repository`. |
| Doble asignación | Reserva con operación condicional (`ConditionExpression stock >= qty`) en Dynamo; en local, sección crítica en un solo proceso | Garantiza que el stock del donante no se sobreasigne. |
| Optimización | HiGHS (WASM) en el Route Handler | Un solo runtime, MILP real. Heurística greedy si hay más de 400 variables o el solver falla. |
| IA | Bedrock `us.anthropic.claude-haiku-4-5-20251001-v1:0` por Converse API | Verificado accesible en la cuenta. Barato. |
| Salida de IA | Siempre validada con Zod; si falla, se cae al parser por reglas y se marca `source: rules` | La IA nunca registra datos sin validación y confirmación. |
| Asistente | Tool use sobre funciones de consulta (`getShelterRanking`, `getPendingByDepartment`…) | Las cifras salen de la base, no del modelo. |
| Auth | JWT HS256 (`jose`) en cookie httpOnly; en AWS se reemplaza por Cognito | Mismo contrato `getSession()`. |
| Hosting | Se decide en la fase de despliegue y requiere aprobación | Amplify necesita repositorio Git; la alternativa es CloudFront + Lambda. |

## Modelo de datos (tablas lógicas)

`User`, `Shelter`, `ShelterInventory`, `ShelterNeed`, `Donation`, `DonationItem`, `DonationAllocation`, `DistributionCenter`, `Shipment`, `ShipmentEvent`, `Emergency`, `GeographicLocation`, `PriorityScore`, `OptimizationRun`, `AuditLog`, `DataSource`.

Campos comunes: `id`, `createdAt`, `updatedAt`, y procedencia (`source_type`, `source_name`, `source_url`, `imported_at`, `last_verified_at`, `is_simulated`).

### DynamoDB (tabla única `aidtrack-<env>`)

| Entidad | PK | SK | GSI1 (GSI1PK / GSI1SK) |
|---|---|---|---|
| Shelter | `SHELTER#id` | `META` | `DEPT#cod` / `SHELTER#id` |
| Inventario | `SHELTER#id` | `INV#producto` | |
| Necesidad | `SHELTER#id` | `NEED#id` | `NEEDSTATUS#estado` / `fecha` |
| Donación | `DONATION#id` | `META` | `DONOR#userId` / fecha |
| Item | `DONATION#id` | `ITEM#n` | |
| Asignación | `DONATION#id` | `ALLOC#id` | `SHELTER#id` / `ALLOC#id` |
| Envío | `SHIPMENT#id` | `META` | `DONATION#id` / `SHIPMENT#id` |
| Evento | `SHIPMENT#id` | `EVT#ts#n` | |
| Ubigeo | `UBIGEO#cod` | `META` | |
| Estadística SINPAD | `STAT#dpto` | `YEAR#año` | |
| Auditoría | `AUDIT#yyyy-mm` | `ts#id` | |
| Contador | `COUNTER#DON#año` | `META` | |

## Fórmulas

**Índice de necesidad** = suma ponderada de factores disponibles, renormalizada por el peso de los factores presentes.

- Déficit relativo (35): por producto esencial, `max(0, 1 − inventario / (personas × consumoDiario × díasObjetivo))`, promediado.
- Autonomía (25): `1 − min(díasAutonomía, 7) / 7`, tomando el producto más crítico.
- Gravedad (20): urgencia máxima de las necesidades abiertas (crítica 1, alta 0.75, media 0.5, baja 0.25), ponderada por pendiente.
- Vulnerabilidad (10): proporción declarada de niños, adultos mayores y personas con discapacidad. Si no existe, se omite.
- Logística (10): dificultad declarada de acceso (0–1).

Confianza: `alta` ≥ 4 factores y datos de ≤ 3 días; `media` 3 factores o datos de ≤ 10 días; `baja` en otro caso. Datos más viejos que 7 días bajan la confianza y se avisan, sin cambiar el puntaje.

Niveles: crítico ≥ 75, alto ≥ 55, moderado ≥ 35, bajo < 35, sin datos suficientes si hay menos de 2 factores.

**MILP.** Por cada producto: variables `x[i,j] ≥ 0` (cantidad del ítem i al albergue j) y `u[j]` (necesidad no cubierta).
Minimizar `Σ w[j]·u[j] + λ·Σ d[i,j]·x[i,j]`.
Sujeto a `Σj x[i,j] ≤ stock[i]`, `x[i,j] + u[j] ≥ pendiente[j]` y `x[i,j] ≤ capacidadRecepción[j]`, con binarias `y[i,j]` para evitar entregas menores que un mínimo útil.

## Rutas

Páginas: `/`, `/donar`, `/donar/{voz,texto,formulario}`, `/donaciones`, `/donaciones/[id]`, `/mapa`, `/ranking`, `/albergues`, `/albergues/[id]`, `/albergues/registrar`, `/necesidades`, `/dashboard`, `/distribucion`, `/distribucion/simulador`, `/login`, `/registro`, `/admin`.

API: `/api/auth/*`, `/api/shelters`, `/api/needs`, `/api/donations`, `/api/ai/parse-donation`, `/api/ai/parse-need`, `/api/ai/assistant`, `/api/optimize`, `/api/allocations/[id]/approve`, `/api/shipments/*`, `/api/ranking`, `/api/dashboard`, `/api/geo/*`, `/api/admin/import`, `/api/simulator`.

## Seguridad

- Zod en cada entrada, límites de tamaño de cuerpo, rate limit por IP y usuario en memoria (en AWS, WAF o API Gateway).
- `requireRole()` en cada handler. El coordinador de albergue solo accede a recursos con su `shelterId`.
- Contactos solo para roles autorizados.
- QR con token firmado de solo lectura. Confirmar exige sesión de coordinador del albergue destino, el código de confirmación de 6 dígitos (se guarda como hash) y un estado válido.
- Bitácora de auditoría para cambios sensibles.

## Estrategia de pruebas

Vitest para dominio (priorización, optimización, reserva, trazabilidad, ETL, authz, parser). Una prueba e2e sobre los servicios y los Route Handlers recorre el flujo completo contra el repositorio en memoria.
