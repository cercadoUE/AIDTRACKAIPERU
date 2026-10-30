# AIDTRACK AI PERÚ

Plataforma nacional de donaciones y ayuda humanitaria. Conecta lo que las personas donan con las necesidades de los albergues mediante IA generativa (Amazon Bedrock) y optimización matemática (MILP con HiGHS).

**Demo pública:** https://aawdafd2pq5xfnkasu5qxjndbe0jinoi.lambda-url.us-east-1.on.aws
Las credenciales de la cuenta de demostración se entregan por el portal de la Kiro IAthon, no en este repositorio. En local, `npm run seed` crea cuentas demo con la contraseña definida en `DEMO_PASSWORD`.

> Los albergues, inventarios y donaciones de la demo son **simulados** y se muestran con la etiqueta SIMULADO. El catálogo territorial (INEI) y las estadísticas históricas de emergencias (INDECI/SINPAD) provienen de archivos oficiales. El índice de necesidad es experimental y no es un criterio oficial.

## Qué hace

- **Donar por texto, voz o formulario.** Bedrock extrae productos, cantidades y ubicación; el usuario revisa y confirma. Las cantidades ambiguas (por ejemplo "botellas" en vez de litros) exigen confirmación.
- **Índice de necesidad 0–100** por albergue, con explicación y nivel de confianza. Pesos configurables (déficit 35, autonomía 25, gravedad 20, vulnerabilidad 10, logística 10).
- **Asignación óptima:** un MILP por producto minimiza la necesidad prioritaria no cubierta sin superar el stock del donante ni lo pendiente del albergue. Usa una heurística greedy si el problema es grande.
- **Trazabilidad:** folio `DON-AAAA-NNNNNN`, aprobación por coordinación logística, estados de envío, historial de eventos, QR de seguimiento (solo lectura) y confirmación de recepción con código de 6 dígitos.
- **Mapa nacional** (Leaflet), **ranking**, **dashboard** con alertas y un **asistente** que responde con consultas a la base.
- **Simulador de emergencias** con comparación antes/después, sobre una copia de los datos.
- **ETL** de UBIGEO (INEI) y SINPAD (INDECI): detecta codificación y delimitador, valida, deduplica, reporta errores y es idempotente.

## Roles

| Rol | Puede |
|---|---|
| Donante | Registrar donaciones, ver recomendaciones y seguimiento |
| Coordinador de albergue | Administrar su albergue, registrar necesidades, confirmar recepciones |
| Coordinador logístico | Aprobar asignaciones, gestionar despachos, usar el simulador |
| Administrador | Verificar albergues, gestionar roles, importar datos, configurar pesos, auditoría |

La autorización se aplica en el servidor (`src/server/lib/auth.ts`).

## Arquitectura

```
Next.js 16 (App Router) ─ Route Handlers /api/* ─ servicios de dominio ─ puertos
                                                    ├ Repository: archivo local | DynamoDB
                                                    ├ IA: reglas locales | Amazon Bedrock
                                                    └ Voz: Web Speech API | Amazon Transcribe
```

- `src/app/` páginas y API · `src/server/` dominio, servicios, adaptadores, ETL, IA
- `infra/` AWS CDK (DynamoDB, Lambda + Function URL, Secrets Manager, CloudWatch)
- `.kiro/specs/aidtrack/` requisitos, diseño y plan

## Ejecutar localmente

Requisitos: Node.js 22 o superior.

```bash
npm install
npm run dev            # http://localhost:3000, siembra datos demo al iniciar
```

Sin AWS la app funciona con almacenamiento en archivo (`data/local/db.json`) y el intérprete por reglas.

Datos oficiales (opcional): descarga en `data/raw/` el CSV `BD_2003-2025_EMERGENCIAS.csv` (datosabiertos.gob.pe) y `ubigeo/UBIGEOS_2022_1891_distritos.csv` (INEI), y ejecuta `npm run etl`.

Para usar Bedrock en local: `AI_PROVIDER=bedrock` con credenciales AWS en el entorno.

## Scripts

| Comando | Descripción |
|---|---|
| `npm test` | Pruebas unitarias y e2e del flujo principal (Vitest) |
| `npm run typecheck` / `npm run lint` | Tipos y lint |
| `npm run etl` | Importa UBIGEO y SINPAD |
| `npm run seed` | Reinicia los datos de demostración (conserva los oficiales) |
| `npm run smoke` | Prueba HTTP del flujo completo contra un servidor (`BASE=...`) |
| `npm run check:bedrock` / `check:dynamo` | Integración real con AWS |
| `npm run package:lambda` | Genera `.lambda-package/` para Lambda |

## Variables de entorno

| Variable | Uso |
|---|---|
| `STORAGE` | `file` (defecto), `memory` o `dynamo` |
| `DYNAMO_TABLE` | Tabla DynamoDB (con `STORAGE=dynamo`) |
| `AI_PROVIDER` | `rules` (defecto) o `bedrock` |
| `BEDROCK_MODEL_ID` | Por defecto `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `AUTH_SECRET` / `AUTH_SECRET_ARN` | Clave de sesión directa o en Secrets Manager (obligatoria en producción) |
| `TRANSCRIBE` | `aws` para habilitar Amazon Transcribe |
| `AUTO_SEED` | `1` para sembrar la demo en producción |
| `NEXT_BASE_PATH` | Prefijo de ruta (por ejemplo, detrás de un proxy) |
| `TEAM_ID` | Id del equipo en la Kiro IAthon, devuelto por `GET /health` (T062) |

No subas credenciales: `.env*` está en `.gitignore`.

## Despliegue en AWS

Con CDK (requiere `cdk bootstrap` en la cuenta):

```bash
npm run package:lambda
cd infra && npm install && npx cdk deploy -c stage=dev
```

La demo pública se desplegó con la CLI de AWS (la cuenta del taller bloquea el bootstrap de CDK) usando los mismos recursos: Lambda ARM64 con Lambda Web Adapter y Function URL, DynamoDB bajo demanda, Secrets Manager y un rol IAM de mínimo privilegio.

## Fuentes de datos

- INDECI – SINPAD: [Emergencias y daños a nivel nacional](https://www.datosabiertos.gob.pe/dataset/emergencias-y-da%C3%B1os-nivel-nacional-por-departamento)
- INEI – [UBIGEO](https://www.datosabiertos.gob.pe/dataset/ubigeos-c%C3%B3digos-de-ubicaci%C3%B3n-geogr%C3%A1fica-instituto-nacional-de-estad%C3%ADstica-e-inform%C3%A1tica-inei)
- Límites departamentales: [juaneladio/peru-geojson](https://github.com/juaneladio/peru-geojson)
- Mapa base: © OpenStreetMap
