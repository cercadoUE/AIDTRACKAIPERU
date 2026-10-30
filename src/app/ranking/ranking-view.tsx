"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake } from "lucide-react";
import { api } from "@/lib/api";
import { DEPARTMENTS, PRODUCTS } from "@/server/domain/catalog";
import { LEVELS, fmtDate, fmtNum } from "@/lib/format";
import { Badge, Button, Card, CardContent, EmptyState, ErrorBox, Notice, PageHeader, Select, SimBadge, Spinner, Table, Td, Th } from "@/components/ui";

interface Row { rank: number | null; shelterId: string; name: string; department: string; occupants: number; mainNeed: string | null; autonomyDays: number | null; index: number | null; metric: number | null; note: string | null; level: keyof typeof LEVELS; confidence: string; preliminary: boolean; updatedAt: string; verified: boolean; simulated: boolean }

const MODES = [["national", "Nacional"], ["department", "Por departamento"], ["product", "Por producto"], ["deficit", "Por déficit"], ["urgency", "Por urgencia"]] as const;

export function RankingView({ initialDepartment }: { initialDepartment?: string }) {
  const [mode, setMode] = React.useState<string>(initialDepartment ? "department" : "national");
  const [department, setDepartment] = React.useState(initialDepartment ?? "20");
  const [product, setProduct] = React.useState("agua_potable");
  const qs = new URLSearchParams({ mode, ...(mode === "department" ? { department } : {}), ...(mode === "product" ? { product } : {}) });
  const q = useQuery({ queryKey: ["ranking", mode, department, product], queryFn: () => api<{ rows: Row[] }>(`/api/ranking?${qs}`) });
  const metricLabel = mode === "deficit" ? "Déficit (%)" : mode === "urgency" ? "Urgencia (%)" : mode === "product" ? "Pendiente" : "Índice";

  return (
    <>
      <PageHeader title="Ranking de albergues más necesitados del Perú" subtitle="El índice (0–100) combina déficit relativo, autonomía, gravedad, vulnerabilidad y dificultad logística. Los pesos son experimentales y configurables; no son criterios oficiales." />
      <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-3 p-4">
        <div role="tablist" aria-label="Tipo de ranking" className="flex flex-wrap gap-1.5">{MODES.map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === k ? "bg-brand2 text-white" : "bg-black/5 dark:bg-white/10"}`}>{l}</button>)}</div>
        {mode === "department" && <Select aria-label="Departamento" className="w-52" value={department} onChange={(e) => setDepartment(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>}
        {mode === "product" && <Select aria-label="Producto" className="w-52" value={product} onChange={(e) => setProduct(e.target.value)}>{PRODUCTS.filter((p) => !p.medicine).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select>}
      </CardContent></Card>
      <div className="mb-4"><Notice tone="orange">Las filas marcadas <b>Preliminar</b> se calculan con pocos datos o con información desactualizada: no son una evaluación definitiva. Los albergues sin datos suficientes aparecen al final, sin posición.</Notice></div>

      {q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.rows.length ? <EmptyState title="Sin resultados" text="No hay albergues que cumplan este filtro." /> : (
        <Table className="min-w-[900px]">
          <thead><tr><Th>#</Th><Th>Albergue</Th><Th>Departamento</Th><Th>Personas</Th><Th>Principal necesidad</Th><Th>Autonomía</Th><Th>{metricLabel}</Th><Th>Actualizado</Th><Th>Verificación</Th><Th><span className="sr-only">Ayudar</span></Th></tr></thead>
          <tbody>
            {q.data.rows.map((r) => (
              <tr key={r.shelterId}>
                <Td className="font-bold">{r.rank ?? "—"}</Td>
                <Td><Link prefetch={false} className="font-medium text-brand2 underline" href={`/albergues/${r.shelterId}`}>{r.name}</Link> {r.simulated && <SimBadge />}</Td>
                <Td>{r.department}</Td><Td>{fmtNum(r.occupants)}</Td><Td>{r.mainNeed ?? "—"}</Td>
                <Td>{r.autonomyDays === null ? "s/d" : `${r.autonomyDays} d`}</Td>
                <Td><span className={`inline-block min-w-12 rounded-full px-2.5 py-0.5 text-center text-xs font-bold ${LEVELS[r.level].cls}`}>{r.metric ?? "s/d"}</span>{r.note && <div className="text-xs text-muted">{r.note}</div>}{r.preliminary && <Badge tone="orange" className="mt-1">Preliminar</Badge>}</Td>
                <Td className="text-xs">{fmtDate(r.updatedAt)}</Td>
                <Td><Badge tone={r.verified ? "green" : "gray"}>{r.verified ? "Verificado" : "No verificado"}</Badge></Td>
                <Td><Link prefetch={false} href={`/donar?albergue=${r.shelterId}`}><Button size="sm" variant="accent"><HeartHandshake className="size-4" /> Ayudar a este albergue</Button></Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
