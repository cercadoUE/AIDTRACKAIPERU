"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { PRODUCTS, PRODUCT_BY_KEY, productLabel } from "@/server/domain/catalog";
import { LEVELS, NEED_STATUS, SHELTER_STATUS, URGENCY, fmtDate, fmtNum } from "@/lib/format";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Field, Input, Notice, PageHeader, Select, SimBadge, Spinner, Table, Td, Th, Textarea } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";

interface Detail {
  shelter: { id: string; name: string; department: string; province: string; district: string; ubigeo: string; address: string; lat: number; lng: number; capacity: number; occupants: number; families: number; type: string; status: string; verified: boolean; is_simulated: boolean; dataUpdatedAt: string; source_name: string; hasContact: boolean; contact?: { name: string; phone: string } };
  priority: { score: number | null; level: keyof typeof LEVELS; confidence: string; autonomyDays: number | null; explanation: string; factors: Record<string, number | null>; missing: string[] };
  inventory: { id: string; product: string; quantity: number; unit: string }[];
  needs: { id: string; product: string; quantity: number | null; fulfilled: number; reserved: number; unit: string; urgency: string; status: string; notes?: string }[];
  received: { id: string; product: string; quantity: number; unit: string; donationFolio?: string; donationId: string }[];
  history: { id: string; createdAt: string; changes: Record<string, unknown> }[];
  canEdit: boolean;
}
interface ParsedNeeds { occupants: number | null; autonomyDays: number | null; needs: { category: string; product: string; quantity: number | null; unit: string; needsConfirmation: boolean; note?: string; urgency: string }[]; warnings: string[]; source: string }

function describeChange(v: unknown): string {
  if (v && typeof v === "object" && "from" in v && "to" in v) {
    const c = v as { from: unknown; to: unknown };
    return `${String(c.from ?? "—")} → ${String(c.to)}`;
  }
  return String(v);
}

const FACTOR_LABEL: Record<string, string> = { deficit: "Déficit relativo", autonomy: "Autonomía", severity: "Gravedad de necesidades", vulnerability: "Vulnerabilidad", logistics: "Dificultad logística" };

export default function AlbergueDetalle() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["shelter", id, user?.id], queryFn: () => api<Detail>(`/api/shelters/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["shelter", id] });

  const verify = useMutation({ mutationFn: (decision: string) => api(`/api/shelters/${id}/verify`, { method: "POST", json: { decision } }), onSuccess: () => { toast("ok", "Estado actualizado"); refresh(); }, onError: (e) => toast("error", e.message) });
  const [inv, setInv] = React.useState({ product: "agua_potable", quantity: "" });
  const saveInv = useMutation({ mutationFn: () => api(`/api/shelters/${id}/inventory`, { method: "PUT", json: { product: inv.product, quantity: Number(inv.quantity), unit: PRODUCT_BY_KEY.get(inv.product)!.unit } }), onSuccess: () => { toast("ok", "Inventario actualizado"); setInv({ ...inv, quantity: "" }); refresh(); }, onError: (e) => toast("error", e.message) });
  const [occ, setOcc] = React.useState({ occupants: "", families: "" });
  const saveOcc = useMutation({ mutationFn: () => api(`/api/shelters/${id}`, { method: "PATCH", json: { occupants: Number(occ.occupants), families: Number(occ.families || 0) } }), onSuccess: () => { toast("ok", "Ocupación actualizada"); refresh(); }, onError: (e) => toast("error", e.message) });

  // Registro de necesidades por IA con aprobación explícita
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedNeeds | null>(null);
  const [rows, setRows] = React.useState<(ParsedNeeds["needs"][number] & { key: number; ok: boolean })[]>([]);
  const parse = useMutation({ mutationFn: () => api<{ result: ParsedNeeds }>("/api/ai/parse-need", { method: "POST", json: { text } }), onSuccess: ({ result }) => { setParsed(result); setRows(result.needs.map((n, i) => ({ ...n, key: i, ok: !n.needsConfirmation }))); } });
  const saveNeeds = useMutation({
    mutationFn: () => api(`/api/shelters/${id}/needs`, { method: "POST", json: { confirmed: true, occupants: parsed?.occupants ?? undefined, needs: rows.map((r) => ({ category: r.category, product: r.product, quantity: r.quantity, unit: PRODUCT_BY_KEY.get(r.product)!.unit, urgency: r.urgency, notes: r.note })) } }),
    onSuccess: () => { toast("ok", "Necesidades guardadas"); setParsed(null); setText(""); setRows([]); refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const confirmQty = useMutation({ mutationFn: (v: { nid: string; quantity: number }) => api(`/api/needs/${v.nid}`, { method: "PATCH", json: { quantity: v.quantity } }), onSuccess: () => { toast("ok", "Cantidad confirmada"); refresh(); }, onError: (e) => toast("error", e.message) });
  const closeNeed = useMutation({ mutationFn: (nid: string) => api(`/api/needs/${nid}`, { method: "PATCH", json: { status: "closed" } }), onSuccess: refresh, onError: (e) => toast("error", e.message) });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const { shelter: s, priority: p } = q.data!;
  const d = q.data!;
  const canRowSave = rows.length > 0 && rows.every((r) => (r.quantity === null || r.quantity > 0) && (!r.needsConfirmation || r.ok));

  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.district}, ${s.province}, ${s.department} · UBIGEO ${s.ubigeo}`}
        actions={<div className="flex flex-wrap items-center gap-2">{s.is_simulated && <SimBadge />}<Badge tone={s.verified ? "green" : "orange"}>{SHELTER_STATUS[s.status]}</Badge><Link prefetch={false} href={`/donar?albergue=${s.id}`}><Button variant="accent"><HeartHandshake className="size-4" /> Ayudar a este albergue</Button></Link></div>} />

      {s.is_simulated && <div className="mb-4"><Notice tone="violet">Albergue de <b>demostración</b>: sus datos y coordenadas son simulados y no corresponden a un establecimiento real.</Notice></div>}
      {!s.verified && !s.is_simulated && <div className="mb-4"><Notice tone="orange">Este albergue aún no está verificado. {user?.role === "admin" && <span className="ml-2 inline-flex gap-2"><Button size="sm" variant="accent" loading={verify.isPending} onClick={() => verify.mutate("verify")}><ShieldCheck className="size-4" /> Verificar</Button><Button size="sm" variant="outline" onClick={() => verify.mutate("reject")}>Rechazar</Button></span>}</Notice></div>}
      {user?.role === "admin" && s.verified && <div className="mb-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => verify.mutate("deactivate")}>Desactivar</Button><Button size="sm" variant="outline" onClick={() => verify.mutate("historical")}>Marcar histórico</Button></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>¿Por qué tiene esta prioridad?</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-1.5 text-lg font-bold ${LEVELS[p.level].cls}`}>{p.score ?? "s/d"}</span>
              <div><p className="font-semibold">Prioridad {LEVELS[p.level].label.toLowerCase()}</p><p className="text-xs text-muted">Confianza {p.confidence} · Autonomía {p.autonomyDays === null ? "s/d" : `${p.autonomyDays} días`}</p></div>
            </div>
            <p className="text-sm">{p.explanation}</p>
            <div className="grid gap-2 sm:grid-cols-2">{Object.entries(p.factors).map(([k, v]) => (
              <div key={k} className="text-xs"><div className="flex justify-between"><span>{FACTOR_LABEL[k]}</span><span>{v === null ? "sin dato" : `${Math.round(v * 100)}%`}</span></div><div className="mt-1 h-2 rounded-full bg-black/10 dark:bg-white/10"><div className="h-2 rounded-full bg-brand2" style={{ width: `${(v ?? 0) * 100}%` }} /></div></div>
            ))}</div>
            <p className="text-xs text-muted">Índice experimental con pesos configurables; no es un criterio oficial. Los factores sin dato no penalizan el puntaje.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Datos del albergue</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><b>Tipo:</b> {s.type}</p><p><b>Dirección:</b> {s.address}</p><p><b>Capacidad:</b> {fmtNum(s.capacity)}</p><p><b>Alojadas:</b> {fmtNum(s.occupants)} personas · {fmtNum(s.families)} familias</p>
            <p><b>Actualizado:</b> {fmtDate(s.dataUpdatedAt)}</p><p><b>Fuente:</b> {s.source_name}</p>
            <p><b>Contacto:</b> {s.contact ? `${s.contact.name} · ${s.contact.phone}` : s.hasContact ? "Protegido (no tienes autorización)" : "No registrado"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Inventario disponible</CardTitle></CardHeader><CardContent className="space-y-3">
          {d.inventory.length ? <Table><thead><tr><Th>Producto</Th><Th>Cantidad</Th></tr></thead><tbody>{d.inventory.map((i) => <tr key={i.id}><Td>{productLabel(i.product)}</Td><Td>{fmtNum(i.quantity)} {i.unit}</Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">Sin inventario registrado.</p>}
          {d.canEdit && (
            <form className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]" onSubmit={(e) => { e.preventDefault(); saveInv.mutate(); }}>
              <Field label="Producto" htmlFor="ip"><Select id="ip" value={inv.product} onChange={(e) => setInv({ ...inv, product: e.target.value })}>{PRODUCTS.filter((x) => !x.medicine).map((x) => <option key={x.key} value={x.key}>{x.label} ({x.unit})</option>)}</Select></Field>
              <Field label="Cantidad" htmlFor="iq"><Input id="iq" type="number" min={0} step="any" required value={inv.quantity} onChange={(e) => setInv({ ...inv, quantity: e.target.value })} /></Field>
              <Button type="submit" loading={saveInv.isPending}>Guardar</Button>
            </form>
          )}
          {d.canEdit && (
            <form className="grid items-end gap-2 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); saveOcc.mutate(); }}>
              <Field label="Personas alojadas" htmlFor="oc"><Input id="oc" type="number" min={0} required value={occ.occupants} onChange={(e) => setOcc({ ...occ, occupants: e.target.value })} placeholder={String(s.occupants)} /></Field>
              <Field label="Familias" htmlFor="of"><Input id="of" type="number" min={0} value={occ.families} onChange={(e) => setOcc({ ...occ, families: e.target.value })} placeholder={String(s.families)} /></Field>
              <Button type="submit" variant="outline" loading={saveOcc.isPending}>Actualizar ocupación</Button>
            </form>
          )}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Necesidades registradas</CardTitle></CardHeader><CardContent className="space-y-3">
          {d.needs.length ? <Table><thead><tr><Th>Producto</Th><Th>Pedido</Th><Th>Atendido</Th><Th>Urgencia</Th><Th>Estado</Th></tr></thead><tbody>{d.needs.map((n) => (
            <tr key={n.id}><Td>{productLabel(n.product)}</Td>
              <Td>{n.quantity === null ? (d.canEdit ? <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("q")); if (v > 0) confirmQty.mutate({ nid: n.id, quantity: v }); }}><Input name="q" aria-label="Confirmar cantidad" type="number" min={1} className="h-8 w-20" placeholder="Cantidad" /><Button size="sm" type="submit">OK</Button></form> : <Badge tone="orange">Por confirmar</Badge>) : `${fmtNum(n.quantity)} ${n.unit}`}</Td>
              <Td>{fmtNum(n.fulfilled)}{n.reserved > 0 && <span className="text-xs text-muted"> (+{n.reserved} reservado)</span>}</Td><Td>{URGENCY[n.urgency]}</Td>
              <Td><Badge tone={n.status === "validated" ? "blue" : n.status === "fulfilled" ? "green" : "gray"}>{NEED_STATUS[n.status]}</Badge>{d.canEdit && n.status !== "closed" && n.status !== "fulfilled" && <button className="ml-2 text-xs text-brand2 underline" onClick={() => closeNeed.mutate(n.id)}>Cerrar</button>}</Td></tr>))}</tbody></Table> : <p className="text-sm text-muted">Sin necesidades registradas.</p>}

          {d.canEdit && (
            <div className="space-y-3 border-t border-border pt-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand2" /> Registrar necesidades en lenguaje natural</h4>
              <Textarea aria-label="Solicitud" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: Tenemos 200 personas alojadas. Solo contamos con agua para un día y necesitamos 100 mantas." />
              <Button variant="outline" loading={parse.isPending} disabled={text.trim().length < 3} onClick={() => parse.mutate()}>Interpretar solicitud</Button>
              {parse.error && <ErrorBox error={parse.error} />}
              {parsed && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <p className="text-sm">Personas alojadas detectadas: <b>{parsed.occupants ?? "no indicado"}</b> · Autonomía declarada: <b>{parsed.autonomyDays === null ? "no indicada" : `${parsed.autonomyDays} día(s)`}</b></p>
                  {parsed.warnings.map((w) => <Notice key={w} tone="orange">{w}</Notice>)}
                  {rows.map((r) => (
                    <div key={r.key} className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_8rem]">
                      <div><p className="text-sm font-medium">{productLabel(r.product)}</p>{r.note && <p className="text-xs text-warn">{r.note}</p>}</div>
                      <Input aria-label={`Cantidad ${productLabel(r.product)}`} type="number" min={1} value={r.quantity ?? ""} placeholder="Pendiente" onChange={(e) => setRows(rows.map((x) => x.key === r.key ? { ...x, quantity: e.target.value === "" ? null : Number(e.target.value), ok: false } : x))} />
                      <Select aria-label="Urgencia" value={r.urgency} onChange={(e) => setRows(rows.map((x) => x.key === r.key ? { ...x, urgency: e.target.value } : x))}>{Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                      {r.needsConfirmation && <label className="col-span-full flex items-center gap-2 text-xs"><input type="checkbox" checked={r.ok} onChange={(e) => setRows(rows.map((x) => x.key === r.key ? { ...x, ok: e.target.checked } : x))} /> Confirmo (si dejas la cantidad vacía quedará pendiente de confirmar)</label>}
                    </div>
                  ))}
                  <Button variant="accent" loading={saveNeeds.isPending} disabled={!canRowSave} onClick={() => saveNeeds.mutate()}>Aprobar y guardar</Button>
                  {saveNeeds.error && <ErrorBox error={saveNeeds.error} />}
                </div>
              )}
            </div>
          )}
        </CardContent></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Donaciones recibidas / asignadas</CardTitle></CardHeader><CardContent>
          {d.received.length ? <Table><thead><tr><Th>Donación</Th><Th>Producto</Th><Th>Cantidad</Th></tr></thead><tbody>{d.received.map((r) => <tr key={r.id}><Td><Link prefetch={false} className="text-brand2 underline" href={`/donaciones/${r.donationId}`}>{r.donationFolio}</Link></Td><Td>{productLabel(r.product)}</Td><Td>{r.quantity} {r.unit}</Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">Sin donaciones asignadas todavía.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Historial de cambios</CardTitle></CardHeader><CardContent>
          {d.canEdit ? (d.history.length ? <ul className="space-y-2 text-sm">{d.history.map((h) => <li key={h.id}><span className="text-xs text-muted">{fmtDate(h.createdAt)}</span><br />{Object.entries(h.changes).map(([k, v]) => <span key={k} className="mr-2 text-xs"><code>{k}</code>: {describeChange(v)}</span>)}</li>)}</ul> : <p className="text-sm text-muted">Sin cambios registrados.</p>) : <p className="text-sm text-muted">El historial es visible para el coordinador del albergue y administración.</p>}
        </CardContent></Card>
      </div>
    </>
  );
}
