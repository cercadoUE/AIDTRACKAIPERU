"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { DEPARTMENTS, PRODUCTS, productLabel } from "@/server/domain/catalog";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Field, Input, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { useSession } from "@/components/providers";

type Action =
  | { type: "emergency"; departmentCode: string; severity: number }
  | { type: "increase_needs"; departmentCode: string; factor: number }
  | { type: "set_inventory"; shelterId: string; product: string; quantity: number }
  | { type: "block_route"; shelterId: string }
  | { type: "add_donation"; product: string; quantity: number };

interface Snap { uncoveredUnits: number; availableUnits: number; assignedUnits: number; coveredNeeds: number; openNeeds: number; shelters: number; totalKm: number; estimatedCostPEN: number; method: string; allocations: { shelter: string; department: string; product: string; quantity: number; unit: string; km: number }[] }
interface Result { scenario: string; before: Snap; after: Snap; explanation: string[]; notice: string }

const describe = (a: Action) =>
  a.type === "emergency" ? `Emergencia severidad ${a.severity} en ${DEPARTMENTS.find((d) => d.code === a.departmentCode)?.name}`
  : a.type === "increase_needs" ? `Necesidades x${a.factor} en ${DEPARTMENTS.find((d) => d.code === a.departmentCode)?.name}`
  : a.type === "set_inventory" ? `Inventario de ${productLabel(a.product)} = ${a.quantity} (${a.shelterId})`
  : a.type === "block_route" ? `Bloquear ruta a ${a.shelterId}` : `Agregar donación: ${a.quantity} de ${productLabel(a.product)}`;

export default function SimuladorPage() {
  const { user } = useSession();
  const allowed = user?.role === "logistics" || user?.role === "admin";
  const shelters = useQuery({ queryKey: ["shelters", ""], queryFn: () => api<{ shelters: { id: string; name: string }[] }>("/api/shelters"), enabled: !!allowed });
  const [name, setName] = React.useState("Lluvias intensas simuladas");
  const [donDept, setDonDept] = React.useState("15");
  const [donItems, setDonItems] = React.useState([{ product: "agua_potable", quantity: 800 }, { product: "frazadas", quantity: 150 }]);
  const [actions, setActions] = React.useState<Action[]>([]);
  const [draft, setDraft] = React.useState<{ type: Action["type"]; dept: string; severity: number; factor: number; shelter: string; product: string; qty: number }>({ type: "emergency", dept: "20", severity: 3, factor: 2, shelter: "", product: "agua_potable", qty: 100 });

  const run = useMutation({ mutationFn: () => api<Result>("/api/simulator", { method: "POST", json: { name, donation: { departmentCode: donDept, items: donItems }, actions } }) });

  const add = () => {
    const d = draft;
    const a: Action | null = d.type === "emergency" ? { type: "emergency", departmentCode: d.dept, severity: d.severity }
      : d.type === "increase_needs" ? { type: "increase_needs", departmentCode: d.dept, factor: d.factor }
      : d.type === "set_inventory" && d.shelter ? { type: "set_inventory", shelterId: d.shelter, product: d.product, quantity: d.qty }
      : d.type === "block_route" && d.shelter ? { type: "block_route", shelterId: d.shelter }
      : d.type === "add_donation" ? { type: "add_donation", product: d.product, quantity: d.qty } : null;
    if (a) setActions([...actions, a]);
  };

  if (!allowed) return (<><PageHeader title="Simulador nacional de emergencias" /><Notice tone="orange">Disponible para coordinación logística y administración. <Link prefetch={false} className="underline" href="/login">Ingresar</Link> (ej. logistica@aidtrack.demo)</Notice></>);
  const r = run.data;
  const row = (label: string, b: number | string, a: number | string, good: "up" | "down") => {
    const n = typeof b === "number" && typeof a === "number" ? a - b : 0;
    const better = good === "up" ? n > 0 : n < 0;
    return <tr key={label}><Td>{label}</Td><Td>{b}</Td><Td className="font-semibold">{a}</Td><Td>{n === 0 ? "—" : <Badge tone={better ? "green" : "orange"}>{n > 0 ? "+" : ""}{Math.round(n * 100) / 100}</Badge>}</Td></tr>;
  };
  return (
    <>
      <PageHeader title="Simulador nacional de emergencias" subtitle="Crea un escenario, aplica cambios y vuelve a ejecutar el optimizador. Trabaja sobre una copia: no modifica los datos reales." actions={<Badge tone="violet"><FlaskConical className="size-3.5" /> ESCENARIO SIMULADO</Badge>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>1. Donación a distribuir</CardTitle></CardHeader><CardContent className="space-y-3">
          <Field label="Nombre del escenario" htmlFor="n"><Input id="n" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Origen del donante" htmlFor="od"><Select id="od" value={donDept} onChange={(e) => setDonDept(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select></Field>
          {donItems.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
              <Select aria-label="Producto" value={it.product} onChange={(e) => setDonItems(donItems.map((x, j) => j === i ? { ...x, product: e.target.value } : x))}>{PRODUCTS.filter((p) => !p.medicine).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select>
              <Input aria-label="Cantidad" type="number" min={1} value={it.quantity} onChange={(e) => setDonItems(donItems.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
              <Button variant="ghost" aria-label="Quitar" onClick={() => setDonItems(donItems.filter((_, j) => j !== i))}><Trash2 className="size-4 text-danger" /></Button>
            </div>))}
          <Button variant="outline" size="sm" onClick={() => setDonItems([...donItems, { product: "arroz", quantity: 100 }])}><Plus className="size-4" /> Producto</Button>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>2. Cambios del escenario</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select aria-label="Tipo de cambio" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Action["type"] })}>
              <option value="emergency">Crear emergencia en un departamento</option><option value="increase_needs">Incrementar necesidades</option><option value="set_inventory">Modificar inventario de un albergue</option><option value="block_route">Bloquear ruta a un albergue</option><option value="add_donation">Agregar donación</option></Select>
            {(draft.type === "emergency" || draft.type === "increase_needs") && <Select aria-label="Departamento" value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>}
            {(draft.type === "set_inventory" || draft.type === "block_route") && <Select aria-label="Albergue" value={draft.shelter} onChange={(e) => setDraft({ ...draft, shelter: e.target.value })}><option value="">Elige albergue…</option>{shelters.data?.shelters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
            {draft.type === "emergency" && <Input aria-label="Severidad 1 a 5" type="number" min={1} max={5} value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: Number(e.target.value) })} />}
            {draft.type === "increase_needs" && <Input aria-label="Factor" type="number" min={1} max={10} step="0.5" value={draft.factor} onChange={(e) => setDraft({ ...draft, factor: Number(e.target.value) })} />}
            {(draft.type === "set_inventory" || draft.type === "add_donation") && <><Select aria-label="Producto" value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })}>{PRODUCTS.filter((p) => !p.medicine).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select><Input aria-label="Cantidad" type="number" min={0} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} /></>}
          </div>
          <Button variant="outline" size="sm" onClick={add}><Plus className="size-4" /> Agregar cambio</Button>
          <ul className="space-y-1">{actions.map((a, i) => <li key={i} className="flex items-center justify-between rounded-lg bg-violet-500/10 px-3 py-1.5 text-sm">{describe(a)}<button aria-label="Quitar cambio" onClick={() => setActions(actions.filter((_, j) => j !== i))}><Trash2 className="size-4 text-danger" /></button></li>)}{!actions.length && <li className="text-sm text-muted">Sin cambios: se comparará consigo mismo.</li>}</ul>
        </CardContent></Card>
      </div>

      <div className="my-5 flex items-center gap-3"><Button size="lg" variant="accent" loading={run.isPending} disabled={!donItems.length} onClick={() => run.mutate()}><Play className="size-5" /> Ejecutar optimización</Button>{run.error && <ErrorBox error={run.error} />}</div>

      {r && (
        <div className="space-y-5">
          <Notice tone="violet"><b>ESCENARIO SIMULADO · {r.scenario}.</b> {r.notice}</Notice>
          <Card><CardHeader><CardTitle>Antes y después</CardTitle></CardHeader><CardContent>
            <Table><thead><tr><Th>Indicador</Th><Th>Antes</Th><Th>Después</Th><Th>Cambio</Th></tr></thead><tbody>
              {row("Necesidades sin cubrir (unidades)", r.before.uncoveredUnits, r.after.uncoveredUnits, "down")}
              {row("Recursos disponibles (unidades)", r.before.availableUnits, r.after.availableUnits, "up")}
              {row("Recursos asignados (unidades)", r.before.assignedUnits, r.after.assignedUnits, "up")}
              {row("Necesidades cubiertas completamente", r.before.coveredNeeds, r.after.coveredNeeds, "up")}
              {row("Albergues beneficiados", r.before.shelters, r.after.shelters, "up")}
              {row("Distancia total estimada (km)", r.before.totalKm, r.after.totalKm, "down")}
              {row("Costo estimado (S/, experimental)", r.before.estimatedCostPEN, r.after.estimatedCostPEN, "down")}
              {row("Método de optimización", r.before.method.toUpperCase(), r.after.method.toUpperCase(), "up")}
            </tbody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle>Explicación de los cambios</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{r.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul></CardContent></Card>
          <div className="grid gap-5 lg:grid-cols-2">
            {(["before", "after"] as const).map((k) => (
              <Card key={k}><CardHeader><CardTitle>Asignaciones {k === "before" ? "antes" : "después"} (simuladas)</CardTitle></CardHeader><CardContent>
                {r[k].allocations.length ? <Table><thead><tr><Th>Albergue</Th><Th>Producto</Th><Th>Cantidad</Th><Th>km</Th></tr></thead><tbody>{r[k].allocations.map((a, i) => <tr key={i}><Td>{a.shelter}<div className="text-xs text-muted">{a.department}</div></Td><Td>{a.product}</Td><Td>{a.quantity} {a.unit}</Td><Td>{a.km}</Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">Sin asignaciones posibles.</p>}
              </CardContent></Card>))}
          </div>
        </div>
      )}
    </>
  );
}
