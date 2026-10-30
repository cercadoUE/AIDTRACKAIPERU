"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { DEPARTMENTS } from "@/server/domain/catalog";
import { LEVELS, SHELTER_STATUS, fmtDate, fmtNum } from "@/lib/format";
import { Badge, Button, Card, CardContent, EmptyState, ErrorBox, Input, PageHeader, Select, SimBadge, Spinner, Table, Td, Th } from "@/components/ui";

interface Row { id: string; name: string; department: string; province: string; district: string; capacity: number; occupants: number; status: string; verified: boolean; is_simulated: boolean; dataUpdatedAt: string; priority: { score: number | null; level: keyof typeof LEVELS; confidence: string }; mainNeed: string | null }

export default function AlberguesPage() {
  const [f, setF] = React.useState({ q: "", department: "", status: "", verified: "", level: "" });
  const [debounced, setDebounced] = React.useState(f);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(f), 250); return () => clearTimeout(t); }, [f]);
  const qs = new URLSearchParams(Object.entries(debounced).filter(([, v]) => v) as [string, string][]);
  const q = useQuery({ queryKey: ["shelters", qs.toString()], queryFn: () => api<{ shelters: Row[] }>(`/api/shelters?${qs}`) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHeader title="Albergues" subtitle="Consulta, busca y administra los albergues registrados. Los nuevos albergues aparecen como verificados solo después de la validación de un administrador."
        actions={<Link href="/albergues/registrar"><Button><Plus className="size-4" /> Registrar albergue</Button></Link>} />
      <Card className="mb-4"><CardContent className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden /><Input aria-label="Buscar por nombre o ubicación" className="pl-9" placeholder="Buscar por nombre, distrito, provincia…" value={f.q} onChange={set("q")} /></div>
        <Select aria-label="Departamento" value={f.department} onChange={set("department")}><option value="">Todos los departamentos</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>
        <Select aria-label="Estado" value={f.status} onChange={set("status")}><option value="">Todo estado</option>{Object.entries(SHELTER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Prioridad" value={f.level} onChange={set("level")}><option value="">Toda prioridad</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      </CardContent></Card>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.shelters.length ? <EmptyState title="No se encontraron albergues" text="Prueba con otros filtros o registra un albergue nuevo." /> : (
        <Table className="min-w-[860px]">
          <thead><tr><Th>Albergue</Th><Th>Ubicación</Th><Th>Ocupación</Th><Th>Principal necesidad</Th><Th>Prioridad</Th><Th>Estado</Th><Th>Actualizado</Th></tr></thead>
          <tbody>{q.data.shelters.map((s) => (
            <tr key={s.id}>
              <Td><Link className="font-medium text-brand2 underline" href={`/albergues/${s.id}`}>{s.name}</Link> {s.is_simulated && <SimBadge />}</Td>
              <Td>{s.district}, {s.province}<div className="text-xs text-muted">{s.department}</div></Td>
              <Td>{fmtNum(s.occupants)} / {fmtNum(s.capacity)}</Td><Td>{s.mainNeed ?? "—"}</Td>
              <Td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVELS[s.priority.level].cls}`}>{LEVELS[s.priority.level].label}{s.priority.score !== null ? ` · ${s.priority.score}` : ""}</span></Td>
              <Td><Badge tone={s.verified ? "green" : s.status === "pending" ? "orange" : "gray"}>{SHELTER_STATUS[s.status]}</Badge></Td>
              <Td className="text-xs">{fmtDate(s.dataUpdatedAt)}</Td>
            </tr>))}</tbody>
        </Table>
      )}
    </>
  );
}
