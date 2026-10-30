"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Bot, Clock, Inbox, PackageX, Send } from "lucide-react";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/server/domain/catalog";
import { LEVELS, fmtNum } from "@/lib/format";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Input, Notice, PageHeader, Skeleton, Spinner } from "@/components/ui";
import { ShelterMap } from "@/components/map/map-loader";

interface Dash {
  kpis: { sheltersTotal: number; sheltersVerified: number; sheltersSimulated: number; occupants: number; donationsAvailable: number; donationsAssigned: number; deliveriesConfirmed: number; pendingNeeds: number; coverage: number | null; donationsCount: number };
  byDepartment: { code: string; name: string; shelters: number; pending: number; coverage: number | null; avgIndex: number | null }[];
  donationsByCategory: { category: string; quantity: number }[];
  priorityDistribution: { level: keyof typeof LEVELS; count: number }[];
  topRequested: { label: string; pending: number }[];
  evolution: { date: string; count: number }[];
  topDeficit: { id: string; name: string; department: string; index: number }[];
  alerts: { critical: { id: string; name: string; department: string; index: number }[]; lowStock: { id: string; name: string; autonomyDays: number }[]; pendingRequests: number; unassignedDonations: { id: string; folio: string }[]; stale: { id: string; name: string }[] };
}
interface MapPayload { shelters: React.ComponentProps<typeof ShelterMap>["shelters"]; centers: React.ComponentProps<typeof ShelterMap>["centers"]; departments: React.ComponentProps<typeof ShelterMap>["depts"] }

const COLORS = ["#1677ff", "#12b886", "#f59f00", "#e03131", "#7048e8", "#0ca678", "#f76707", "#868e96"];

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</CardContent></Card>;
}

function Assistant() {
  const [q, setQ] = React.useState("");
  const ask = useMutation({ mutationFn: (question: string) => api<{ answer: string; sources: { tool: string; args: Record<string, unknown>; rows: number }[]; mode: string }>("/api/ai/assistant", { method: "POST", json: { question } }) });
  const examples = ["¿Qué albergues de Piura necesitan más agua?", "¿Qué departamento tiene más solicitudes pendientes?", "¿Cuál es la cobertura nacional?"];
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5 text-brand2" /> Asistente del dashboard</CardTitle><p className="text-xs text-muted">Responde con consultas verificables a la base de datos; no inventa cifras.</p></CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) ask.mutate(q); }}>
          <Input aria-label="Pregunta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta sobre albergues, necesidades o cobertura" maxLength={400} />
          <Button type="submit" loading={ask.isPending} aria-label="Preguntar"><Send className="size-4" /></Button>
        </form>
        <div className="flex flex-wrap gap-1.5">{examples.map((e) => <button key={e} type="button" className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { setQ(e); ask.mutate(e); }}>{e}</button>)}</div>
        {ask.error && <ErrorBox error={ask.error} />}
        {ask.data && (
          <div className="space-y-2 rounded-xl bg-brand2/10 p-3 text-sm">
            <p>{ask.data.answer}</p>
            <details className="text-xs text-muted"><summary className="cursor-pointer">Consultas que respaldan la respuesta ({ask.data.mode === "bedrock" ? "Amazon Bedrock" : "reglas"})</summary><ul className="mt-1 list-disc pl-5">{ask.data.sources.map((s, i) => <li key={i}><code>{s.tool}</code> {JSON.stringify(s.args)} → {s.rows} fila(s)</li>)}</ul></details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dash>("/api/dashboard") });
  const m = useQuery({ queryKey: ["map"], queryFn: () => api<MapPayload>("/api/map") });
  if (d.isLoading) return <><PageHeader title="Dashboard nacional" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></>;
  if (d.error) return <ErrorBox error={d.error} />;
  const x = d.data!;
  const k = x.kpis;
  return (
    <>
      <PageHeader title="Dashboard nacional" subtitle="Indicadores calculados en vivo desde la base de datos. Hay datos de demostración simulados mezclados con registros reales." />
      <div className="grid-bg mb-5 grid gap-3 rounded-3xl p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Albergues registrados" value={k.sheltersTotal} hint={`${k.sheltersSimulated} simulados`} />
        <Kpi label="Albergues verificados" value={k.sheltersVerified} />
        <Kpi label="Personas alojadas" value={fmtNum(k.occupants)} hint="según registros" />
        <Kpi label="Cobertura de necesidades" value={k.coverage === null ? "s/d" : `${k.coverage}%`} />
        <Kpi label="Donaciones disponibles" value={fmtNum(k.donationsAvailable)} hint="unidades sin reservar" />
        <Kpi label="Donaciones asignadas" value={fmtNum(k.donationsAssigned)} hint="unidades reservadas" />
        <Kpi label="Entregas confirmadas" value={k.deliveriesConfirmed} />
        <Kpi label="Necesidades pendientes" value={fmtNum(k.pendingNeeds)} hint="unidades" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Alertas</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><h4 className="flex items-center gap-1.5 text-sm font-semibold text-danger"><AlertTriangle className="size-4" /> Necesidad crítica ({x.alerts.critical.length})</h4>{x.alerts.critical.slice(0, 4).map((a) => <Link key={a.id} href={`/albergues/${a.id}`} className="block truncate text-sm underline">{a.name} · {a.index}</Link>)}{!x.alerts.critical.length && <p className="text-sm text-muted">Ninguno</p>}</div>
          <div className="space-y-1"><h4 className="flex items-center gap-1.5 text-sm font-semibold text-warn"><PackageX className="size-4" /> Inventario por agotarse ({x.alerts.lowStock.length})</h4>{x.alerts.lowStock.slice(0, 4).map((a) => <Link key={a.id} href={`/albergues/${a.id}`} className="block truncate text-sm underline">{a.name} · {a.autonomyDays} d</Link>)}{!x.alerts.lowStock.length && <p className="text-sm text-muted">Ninguno</p>}</div>
          <div className="space-y-1"><h4 className="flex items-center gap-1.5 text-sm font-semibold"><Inbox className="size-4" /> Pendientes</h4><p className="text-sm">{x.alerts.pendingRequests} solicitud(es) por validar</p><p className="text-sm">{x.alerts.unassignedDonations.length} donación(es) sin asignar</p></div>
          <div className="space-y-1"><h4 className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="size-4" /> Datos desactualizados ({x.alerts.stale.length})</h4>{x.alerts.stale.slice(0, 4).map((a) => <Link key={a.id} href={`/albergues/${a.id}`} className="block truncate text-sm underline">{a.name}</Link>)}{!x.alerts.stale.length && <p className="text-sm text-muted">Ninguno</p>}</div>
        </CardContent></Card>
        <Assistant />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Necesidades pendientes por departamento</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><BarChart data={x.byDepartment} margin={{ left: -10 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="pending" name="Unidades pendientes" fill="#1677ff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Cobertura por departamento (%)</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><BarChart data={x.byDepartment.filter((r) => r.coverage !== null)} margin={{ left: -10 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="coverage" name="Cobertura %" fill="#12b886" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Donaciones por categoría</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><PieChart><Pie data={x.donationsByCategory.map((c) => ({ name: CATEGORIES[c.category] ?? c.category, value: c.quantity }))} dataKey="value" nameKey="name" outerRadius={90} label>{x.donationsByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Distribución de prioridades</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><PieChart><Pie data={x.priorityDistribution.filter((p) => p.count > 0).map((p) => ({ name: LEVELS[p.level].label, value: p.count, level: p.level }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>{x.priorityDistribution.filter((p) => p.count > 0).map((p) => <Cell key={p.level} fill={LEVELS[p.level].color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Evolución de donaciones registradas</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><LineChart data={x.evolution}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="count" name="Productos donados (registros)" stroke="#7048e8" strokeWidth={2} dot /></LineChart></ResponsiveContainer></CardContent></Card>
        <Card><CardHeader><CardTitle>Productos más solicitados (pendiente)</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer><BarChart data={x.topRequested} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="pending" name="Pendiente" fill="#f59f00" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card><CardHeader><CardTitle>Vista resumida del mapa</CardTitle></CardHeader><CardContent>{m.isLoading ? <Spinner /> : m.data && <ShelterMap shelters={m.data.shelters} centers={m.data.centers} depts={m.data.departments} height="380px" />}<Link className="mt-2 inline-block text-sm text-brand2 underline" href="/mapa">Abrir mapa completo</Link></CardContent></Card>
        <Card><CardHeader><CardTitle>Albergues con mayor índice</CardTitle></CardHeader><CardContent><ol className="space-y-2">{x.topDeficit.map((s, i) => <li key={s.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate"><b>{i + 1}.</b> <Link className="underline" href={`/albergues/${s.id}`}>{s.name}</Link><span className="block text-xs text-muted">{s.department}</span></span><Badge tone={s.index >= 75 ? "red" : s.index >= 55 ? "orange" : "yellow"}>{s.index}</Badge></li>)}</ol><div className="mt-3"><Notice tone="violet">Datos de demostración simulados. Índice experimental.</Notice></div></CardContent></Card>
      </div>
    </>
  );
}
