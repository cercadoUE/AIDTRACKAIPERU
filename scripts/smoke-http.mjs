/**
 * Prueba de humo HTTP del flujo principal contra un servidor en ejecución.
 * Uso: BASE=http://localhost:3100 node scripts/smoke-http.mjs
 * Requiere los datos de demostración (usuarios *.demo, contraseña Demo2026!).
 */
const BASE = process.env.BASE ?? "http://localhost:3100";
const jars = {};
let failures = 0;

async function call(who, method, path, body, raw = false) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(jars[who] ? { cookie: jars[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) jars[who] = set.split(";")[0];
  const data = await res.json().catch(() => ({}));
  return raw ? { status: res.status, data } : data;
}
const status = async (who, method, path, body) => (await call(who, method, path, body, true)).status;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
}
const login = (who, email) => call(who, "POST", "/api/auth/login", { email, password: "Demo2026!" });

await login("donor", "donante@aidtrack.demo");
await login("logi", "logistica@aidtrack.demo");
await login("admin", "admin@aidtrack.demo");

// 1) IA interpreta
const parsed = (await call("donor", "POST", "/api/ai/parse-donation", { text: "Tengo 400 litros de agua, 100 kilos de arroz y 60 frazadas. Estoy en Lima." })).result;
check("IA extrae 3 productos con cantidades", parsed.donations.length === 3 && parsed.donations.every((d) => d.quantity > 0 && !d.needsConfirmation), parsed.source);

// 2) Sin confirmación no se registra
check("rechaza registro sin confirmación (400)", (await status("donor", "POST", "/api/donations", { channel: "text", items: [{ category: "agua", product: "agua_potable", quantity: 5, unit: "litros" }] })) === 400);
check("rechaza cantidad negativa (400)", (await status("donor", "POST", "/api/donations", { channel: "text", confirmed: true, items: [{ category: "agua", product: "agua_potable", quantity: -5, unit: "litros" }] })) === 400);
check("rechaza unidad no canónica (400)", (await status("donor", "POST", "/api/donations", { channel: "text", confirmed: true, items: [{ category: "agua", product: "agua_potable", quantity: 5, unit: "botellas" }] })) === 400);

// 3) Registro
const created = await call("donor", "POST", "/api/donations", { channel: "text", transportAvailable: true, confirmed: true, departmentCode: "15", items: parsed.donations.map((d) => ({ category: d.category, product: d.product, quantity: d.quantity, unit: d.unit })) });
const id = created.donation.id;
check("donación registrada con folio DON-AAAA-NNNNNN", /^DON-\d{4}-\d{6}$/.test(created.donation.folio), created.donation.folio);

// 4) Recomendación
const rec = await call("donor", "POST", `/api/donations/${id}/recommend`);
const byItem = {};
for (const a of rec.allocations) byItem[a.itemId] = (byItem[a.itemId] ?? 0) + a.quantity;
const itemsOk = created.items.every((i) => (byItem[i.id] ?? 0) <= i.quantity);
check("el sistema recomienda albergues (MILP)", rec.allocations.length > 0 && rec.run.method === "milp", `${rec.allocations.length} asignaciones`);
check("las asignaciones no superan el stock del donante", itemsOk);

// 5) Aprobación: solo logística
check("el donante NO puede aprobar (403)", (await status("donor", "POST", `/api/donations/${id}/approve`, {})) === 403);
const approved = await call("logi", "POST", `/api/donations/${id}/approve`, {});
check("logística aprueba y se crean envíos", approved.shipments?.length > 0, approved.shipments?.map((s) => s.code).join(","));
check("segunda aprobación rechazada (409)", (await status("logi", "POST", `/api/donations/${id}/approve`, {})) === 409);

// 6) Despacho
const ship = approved.shipments[0];
check("no se puede saltar etapas (409)", (await status("logi", "POST", `/api/shipments/${ship.id}/advance`, { to: "delivered" })) === 409);
check("donante no avanza el envío (403)", (await status("donor", "POST", `/api/shipments/${ship.id}/advance`, { to: "prepared" })) === 403);
for (const to of ["prepared", "dispatched", "in_transit", "delivered"]) {
  const r = await call("logi", "POST", `/api/shipments/${ship.id}/advance`, { to });
  check(`envío → ${to}`, r.shipment?.status === to);
}

// 7) Recepción: coordinador del albergue destino
const users = (await call("admin", "GET", "/api/admin/overview")).users;
const coord = users.find((u) => u.email === "coordinador@aidtrack.demo");
check("admin asigna coordinador al albergue destino", (await status("admin", "PATCH", `/api/admin/users/${coord.id}`, { role: "shelter_coordinator", shelterId: ship.shelterId })) === 200);
await login("coord", "coordinador@aidtrack.demo");
check("QR/seguimiento público no confirma nada (401 sin sesión)", (await status("anon", "POST", `/api/shipments/${ship.id}/confirm`, { code: ship.confirmationCode })) === 401);
check("logística no puede confirmar recepción (403)", (await status("logi", "POST", `/api/shipments/${ship.id}/confirm`, { code: ship.confirmationCode })) === 403);
check("código incorrecto rechazado (403)", (await status("coord", "POST", `/api/shipments/${ship.id}/confirm`, { code: "000000" })) === 403);
const done = await call("coord", "POST", `/api/shipments/${ship.id}/confirm`, { code: ship.confirmationCode });
check("recepción confirmada por el coordinador del albergue", done.shipment?.status === "received" && done.shipment.confirmationCodeHash === "");
check("confirmación duplicada rechazada (409)", (await status("coord", "POST", `/api/shipments/${ship.id}/confirm`, { code: ship.confirmationCode })) === 409);

// 8) Seguimiento y autorización
const detail = await call("donor", "GET", `/api/donations/${id}`);
check("historial de eventos con actor y estados", detail.events.length >= 6 && detail.events.every((e) => e.actorId && e.at && e.to));
check("la donación refleja el avance", ["approved", "prepared", "dispatched", "in_transit", "delivered", "received"].includes(detail.donation.status), detail.donation.status);
const other = (await call("anon", "GET", "/api/shelters")).shelters.find((s) => s.id !== ship.shelterId);
check("coordinador no edita inventario de otro albergue (403)", (await status("coord", "PUT", `/api/shelters/${other.id}/inventory`, { product: "arroz", quantity: 9, unit: "kg" })) === 403);
check("contacto oculto al público", (await call("anon", "GET", `/api/shelters/${ship.shelterId}`)).shelter.contact === undefined);
check("contacto visible al coordinador del albergue", !!(await call("coord", "GET", `/api/shelters/${ship.shelterId}`)).shelter.contact);
check("panel admin vedado a donantes (403)", (await status("donor", "GET", "/api/admin/overview")) === 403);

// 9) Indicadores y simulador
const dash = await call("anon", "GET", "/api/dashboard");
check("dashboard con indicadores consistentes", dash.kpis.sheltersTotal > 0 && dash.kpis.deliveriesConfirmed >= 1 && dash.kpis.coverage !== null);
const rank = (await call("anon", "GET", "/api/ranking?mode=national")).rows;
check("ranking ordenado por índice", rank.filter((r) => r.rank).every((r, i, a) => i === 0 || a[i - 1].index >= r.index));
const sim = await call("logi", "POST", "/api/simulator", { name: "smoke", donation: { departmentCode: "15", items: [{ product: "agua_potable", quantity: 500 }] }, actions: [{ type: "emergency", departmentCode: "20", severity: 3 }] });
check("simulador compara antes/después", !!sim.before && !!sim.after && sim.simulated === true);

console.log(failures ? `\n${failures} verificación(es) FALLARON` : "\nTodas las verificaciones pasaron");
process.exit(failures ? 1 : 0);
