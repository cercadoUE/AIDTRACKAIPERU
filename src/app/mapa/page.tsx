"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake, X } from "lucide-react";
import { api } from "@/lib/api";
import { CATEGORIES, DEPARTMENTS } from "@/server/domain/catalog";
import { LEVELS, SHELTER_STATUS, fmtDate, fmtNum, URGENCY } from "@/lib/format";
import { Badge, Button, Card, CardContent, ErrorBox, Notice, PageHeader, Select, SimBadge, Spinner } from "@/components/ui";
import { ShelterMap } from "@/components/map/map-loader";

interface Shelter {
  id: string; name: string; lat: number; lng: number; department: string; departmentCode: string; province: string; district: string; capacity: number; occupants: number;
  level: keyof typeof LEVELS; index: number | null; confidence: string; status: string; verified: boolean; simulated: boolean; mainNeed: string | null; needCategories: string[];
  inventory: { product: string; quantity: number; unit: string }[]; needs: { product: string; pending: number; unit: string; urgency: string }[]; received: number; hasData: boolean; updatedAt: string; explanation: string;
}
interface MapPayload { shelters: Shelter[]; centers: { id: string; name: string; lat: number; lng: number; kind: string; simulated: boolean }[]; departments: { code: string; name: string; shelters: number; occupants: number; pending: number; assigned: number; coverage: number | null; avgIndex: number | null; updatedAt: string | null; simulated: boolean }[] }

export default function MapaPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: () => api<MapPayload>("/api/map") });
  const [f, setF] = React.useState({ dept: "", category: "", level: "", status: "", verified: "", data: "" });
  const [selDept, setSelDept] = React.useState<string | null>(null);
  const [selShelter, setSelShelter] = React.useState<string | null>(null);
  const [centers, setCenters] = React.useState(true);
  const [routes, setRoutes] = React.useState(false);

  const shelters = React.useMemo(() => (q.data?.shelters ?? []).filter((s) =>
    (!f.dept || s.departmentCode === f.dept) && (!f.category || s.needCategories.includes(f.category)) && (!f.level || s.level === f.level) &&
    (!f.status || s.status === f.status) && (!f.verified || String(s.verified) === f.verified) && (!f.data || String(s.hasData) === f.data)), [q.data, f]);
  const dept = q.data?.departments.find((d) => d.code === selDept);
  const sh = q.data?.shelters.find((s) => s.id === selShelter);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Mapa nacional de albergues" subtitle="Rojo: necesidad crítica · Naranja: alta · Amarillo: moderada · Verde: baja · Gris: información insuficiente. Borde discontinuo = dato simulado." />
      <Card className="mb-4"><CardContent className="grid gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Select aria-label="Departamento" value={f.dept} onChange={set("dept")}><option value="">Todos los departamentos</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>
        <Select aria-label="Categoría de necesidad" value={f.category} onChange={set("category")}><option value="">Toda necesidad</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Nivel de prioridad" value={f.level} onChange={set("level")}><option value="">Toda prioridad</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select aria-label="Estado operativo" value={f.status} onChange={set("status")}><option value="">Todo estado</option>{Object.entries(SHELTER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Verificación" value={f.verified} onChange={set("verified")}><option value="">Verificación</option><option value="true">Verificados</option><option value="false">No verificados</option></Select>
        <Select aria-label="Disponibilidad de información" value={f.data} onChange={set("data")}><option value="">Información</option><option value="true">Con datos</option><option value="false">Sin datos suficientes</option></Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={centers} onChange={(e) => setCenters(e.target.checked)} /> Centros y almacenes</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={routes} onChange={(e) => setRoutes(e.target.checked)} /> Rutas simuladas</label>
        <p className="text-sm text-muted sm:col-span-3 lg:col-span-4 self-center">{shelters.length} albergue(s) mostrados</p>
      </CardContent></Card>

      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <ShelterMap shelters={shelters} centers={q.data!.centers} depts={q.data!.departments} selectedDept={selDept} selectedId={selShelter} showCenters={centers} routeFrom={routes}
            onDept={(c) => { setSelDept(c); setSelShelter(null); }} onShelter={(id) => { setSelShelter(id); }} />
          <aside aria-live="polite" className="space-y-3">
            {sh ? (
              <Card><CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><h2 className="font-semibold leading-tight">{sh.name}</h2><Button variant="ghost" size="sm" aria-label="Cerrar" onClick={() => setSelShelter(null)}><X className="size-4" /></Button></div>
                <div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVELS[sh.level].cls}`}>{LEVELS[sh.level].label}{sh.index !== null ? ` · ${sh.index}` : ""}</span>{sh.simulated && <SimBadge />}<Badge tone={sh.verified ? "green" : "gray"}>{sh.verified ? "Verificado" : "No verificado"}</Badge><Badge>{SHELTER_STATUS[sh.status]}</Badge></div>
                <p className="text-sm text-muted">{sh.district}, {sh.province}, {sh.department}</p>
                <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted text-xs">Capacidad</dt><dd>{fmtNum(sh.capacity)}</dd></div><div><dt className="text-muted text-xs">Ocupación</dt><dd>{fmtNum(sh.occupants)}</dd></div><div><dt className="text-muted text-xs">Principal necesidad</dt><dd>{sh.mainNeed ?? "—"}</dd></div><div><dt className="text-muted text-xs">Unidades recibidas</dt><dd>{fmtNum(sh.received)}</dd></div></dl>
                <div><h3 className="text-xs font-semibold uppercase text-muted">Inventario</h3>{sh.inventory.length ? <ul className="text-sm">{sh.inventory.map((i) => <li key={i.product}>{i.product}: {fmtNum(i.quantity)} {i.unit}</li>)}</ul> : <p className="text-sm text-muted">Sin inventario registrado</p>}</div>
                <div><h3 className="text-xs font-semibold uppercase text-muted">Necesidades pendientes</h3>{sh.needs.length ? <ul className="text-sm">{sh.needs.map((n, i) => <li key={i}>{n.product}: {fmtNum(n.pending)} {n.unit} <span className="text-muted">({URGENCY[n.urgency]})</span></li>)}</ul> : <p className="text-sm text-muted">Sin necesidades abiertas</p>}</div>
                <p className="text-xs text-muted">{sh.explanation}</p>
                <p className="text-xs text-muted">Actualizado: {fmtDate(sh.updatedAt)} · Confianza {sh.confidence}</p>
                <div className="flex gap-2"><Link prefetch={false} className="flex-1" href={`/donar?albergue=${sh.id}`}><Button variant="accent" className="w-full"><HeartHandshake className="size-4" /> Ofrecer ayuda</Button></Link><Link prefetch={false} href={`/albergues/${sh.id}`}><Button variant="outline">Detalle</Button></Link></div>
              </CardContent></Card>
            ) : dept ? (
              <Card><CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between"><h2 className="font-semibold">{dept.name}</h2><Button variant="ghost" size="sm" aria-label="Cerrar" onClick={() => setSelDept(null)}><X className="size-4" /></Button></div>
                {dept.simulated && <SimBadge />}
                <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted text-xs">Albergues registrados</dt><dd className="text-lg font-semibold">{dept.shelters}</dd></div><div><dt className="text-muted text-xs">Personas alojadas</dt><dd className="text-lg font-semibold">{fmtNum(dept.occupants)}</dd></div><div><dt className="text-muted text-xs">Necesidades pendientes</dt><dd className="text-lg font-semibold">{fmtNum(dept.pending)}</dd></div><div><dt className="text-muted text-xs">Donaciones asignadas</dt><dd className="text-lg font-semibold">{fmtNum(dept.assigned)}</dd></div><div><dt className="text-muted text-xs">Cobertura estimada</dt><dd className="text-lg font-semibold">{dept.coverage === null ? "s/d" : `${dept.coverage}%`}</dd></div><div><dt className="text-muted text-xs">Índice promedio</dt><dd className="text-lg font-semibold">{dept.avgIndex ?? "s/d"}</dd></div></dl>
                <p className="text-xs text-muted">Actualizado: {fmtDate(dept.updatedAt)}</p>
                {!dept.shelters && <p className="text-sm text-muted">No hay albergues registrados en este departamento.</p>}
                <Link prefetch={false} className="text-sm text-brand2 underline" href={`/ranking?department=${dept.code}`}>Ver ranking del departamento</Link>
              </CardContent></Card>
            ) : <Notice tone="blue">Haz clic en un departamento o en un albergue para ver su detalle.</Notice>}
            <Notice tone="violet">Los puntos y rutas de demostración son <b>simulados</b>; sus coordenadas no corresponden a albergues reales.</Notice>
            <Card><CardContent className="space-y-1 p-3 text-xs">{Object.entries(LEVELS).map(([k, v]) => <div key={k} className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: v.color }} />{v.label}</div>)}<div className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-dashed border-gray-500" />Simulado</div><div className="flex items-center gap-2"><span className="size-3 rounded-sm bg-[#0a2a5e]" />Centro / almacén</div></CardContent></Card>
          </aside>
        </div>
      )}
    </>
  );
}
