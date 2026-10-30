# Requisitos: AIDTRACK AI PERÚ

Plataforma nacional de donaciones y ayuda humanitaria. Conecta donaciones con necesidades de albergues mediante IA (Amazon Bedrock) y optimización (MILP con HiGHS).

## Principios

- Todo dato simulado lleva `is_simulated = true` y se muestra identificado en la interfaz.
- Todo registro lleva procedencia: `source_type`, `source_name`, `source_url`, `imported_at`, `last_verified_at`, `is_simulated`.
- Los datos históricos de SINPAD no se usan como ocupación actual de ningún albergue.
- La IA propone y una persona confirma. Ninguna cantidad ambigua se guarda sin confirmación.
- La asignación es una recomendación. Un coordinador logístico autoriza el despacho.
- La autorización se aplica en el servidor.

## Requisitos funcionales

### R1. Donaciones (flujo principal)
1. El usuario puede registrar una donación por texto, voz o formulario.
2. El parser de texto devuelve JSON validado con Zod (categoría, producto, cantidad, unidad, ubicación).
3. Las cantidades ausentes o ambiguas se marcan "pendiente de confirmación" y bloquean el registro hasta confirmarlas.
4. La voz se transcribe con Amazon Transcribe o, si no está disponible, con Web Speech API del navegador. No se guarda el audio por defecto.
5. Los medicamentos siguen un flujo separado con validación humana y nunca entran a la asignación automática.
6. Cada donación recibe un identificador `DON-AAAA-NNNNNN`.

### R2. Albergues
1. CRUD de albergues con UBIGEO, coordenadas, capacidad, ocupación, inventario y necesidades.
2. Estados: pendiente de verificación, activo, inactivo, histórico, simulado.
3. Un albergue nuevo queda pendiente hasta que un administrador lo verifica.
4. Los datos de contacto no se exponen sin autorización.
5. Se conserva historial de cambios.

### R3. Priorización
1. Índice de necesidad 0–100 con pesos configurables: déficit 35, autonomía 25, gravedad 20, vulnerabilidad 10, logística 10.
2. Si faltan datos, el índice se calcula con los factores disponibles y marca confianza baja. No penaliza la falta de información.
3. Cada resultado incluye factores y explicación basada solo en datos del sistema.

### R4. Asignación óptima
1. MILP (HiGHS) que minimiza la necesidad prioritaria no cubierta, con restricciones de inventario del donante, necesidad pendiente por albergue y capacidad de recepción.
2. Heurística greedy de respaldo si el problema es grande o el solver falla.
3. Una asignación nunca supera el stock del donante ni la necesidad pendiente.
4. La reserva de stock es atómica: no hay doble asignación.

### R5. Trazabilidad
1. Estados: Registrada, Validada, Asignada, Aprobada, Preparada, Despachada, En transporte, Entregada, Recepción confirmada.
2. Cada transición se registra con fecha, actor, estado anterior y nuevo, cantidades y observaciones.
3. El QR identifica el envío pero no confirma la entrega. La confirmación exige un usuario autenticado con rol de coordinador del albergue destino y un código de confirmación.
4. Una confirmación no puede repetirse.

### R6. Mapa, ranking y dashboard
1. Mapa Leaflet con departamentos, albergues con agrupamiento, colores por prioridad y distinción de simulados.
2. Ranking nacional, por departamento, producto, déficit y urgencia. Los rankings con datos incompletos se rotulan "preliminar".
3. Dashboard con indicadores, gráficos y alertas calculados desde la base.

### R7. Necesidades
1. El coordinador escribe una solicitud en lenguaje natural, la IA la interpreta y el coordinador la aprueba.
2. Estados: borrador, pendiente, validada, parcialmente atendida, atendida, cerrada.

### R8. Roles
Donante, coordinador de albergue, coordinador logístico, administrador. Un coordinador solo modifica su propio albergue.

### R9. Datos oficiales y ETL
1. Importador CSV con detección de codificación y delimitador, validación, normalización, deduplicación, reporte de errores y reimportación idempotente.
2. SINPAD: `BD_2003-2025_EMERGENCIAS.csv` (INDECI, datosabiertos.gob.pe). UBIGEO: INEI.
3. Lima Metropolitana y Lima Provincias se unifican en el departamento LIMA usando el prefijo UBIGEO `15`.

### R10. Simulador
Permite crear emergencias simuladas, subir necesidades, modificar inventarios, bloquear rutas, agregar donaciones y volver a optimizar con comparación antes/después. Todo escenario queda marcado como simulado.

### R11. Asistente del dashboard
Responde preguntas con herramientas que consultan la base. No inventa cifras.

## Requisitos no funcionales
- Seguridad: validación Zod, rate limiting, JWT en cookie httpOnly, auditoría, sin secretos en el repositorio.
- Operación local sin AWS mediante adaptadores (almacén en archivo, parser por reglas, JWT local).
- Infraestructura como código con AWS CDK.
- Costos controlados: DynamoDB on-demand, Bedrock con Claude Haiku 4.5, sin recursos permanentes costosos.

## Criterios de aceptación
Los 18 criterios del enunciado original. El flujo e2e donante → IA → recomendación → aprobación → despacho → confirmación debe pasar como prueba automatizada.
