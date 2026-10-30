"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RotateCcw, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { ROLE_LABEL, fmtDate } from "@/lib/format";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Th } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";
import { withBase } from "@/lib/base-path";

interface Overview {
  users: { id: string; name: string; email: string; role: string; shelterId?: string }[];
  pendingShelters: { id: string; name: string; department: string; district: string; status: string; createdAt: string }[];
  audit: { id: string; at: string; actorId: string; action: string; entity: string; entityId: string }[];
  sources: { id: string; name: string; url: string; rows: number; accepted: number; rejected: number; updatedAt: string }[];
  settings: { weights: Record<string, number>; targetDays: number };
  locationsCount: number;
}
interface Report { source: string; encoding: string; delimiter: string; totalRows: number; accepted: number; rejected: number; duplicates: number; errors: { row: number; reason: string }[]; errorsTruncated: boolean; quality: { column: string; empty: number }[]; summary: Record<string, string | number> }

const W_LABEL: Record<string, string> = { deficit: "Déficit relativo", autonomy: "Autonomía", severity: "Gravedad", vulnerability: "Vulnerabilidad", logistics: "Logística" };

export default function AdminPage() {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin"], queryFn: () => api<Overview>("/api/admin/overview"), enabled: user?.role === "admin" });
  const refresh = () => qc.invalidateQueries();
  const [kind, setKind] = React.useState("sinpad");
  const [file, setFile] = React.useState<File | null>(null);
  const [dry, setDry] = React.useState(true);
  const [report, setReport] = React.useState<Report | null>(null);
  const [weights, setWeights] = React.useState<Record<string, number> | null>(null);
  const [days, setDays] = React.useState(3);
  const [coordShelter, setCoordShelter] = React.useState<Record<string, string>>({});

  const verify = useMutation({ mutationFn: (v: { id: string; decision: string }) => api(`/api/shelters/${v.id}/verify`, { method: "POST", json: { decision: v.decision } }), onSuccess: () => { toast("ok", "Albergue actualizado"); refresh(); }, onError: (e) => toast("error", e.message) });
  const role = useMutation({ mutationFn: (v: { id: string; role: string; shelterId?: string }) => api(`/api/admin/users/${v.id}`, { method: "PATCH", json: { role: v.role, shelterId: v.shelterId } }), onSuccess: () => { toast("ok", "Rol actualizado"); refresh(); }, onError: (e) => toast("error", e.message) });
  const imp = useMutation({
    mutationFn: async () => { const res = await fetch(withBase(`/api/admin/import?kind=${kind}&dryRun=${dry ? 1 : 0}`), { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } }); const j = await res.json(); if (!res.ok) throw new Error(j.error); return j.report as Report; },
    onSuccess: (r) => { setReport(r); toast("ok", dry ? "Validación completada (no se guardó nada)" : "Importación completada"); if (!dry) refresh(); }, onError: (e) => toast("error", e.message),
  });
  const reset = useMutation({ mutationFn: () => api("/api/admin/reset-demo", { method: "POST" }), onSuccess: () => { toast("ok", "Datos de demostración reiniciados"); refresh(); }, onError: (e) => toast("error", e.message) });
  const saveW = useMutation({ mutationFn: () => api("/api/admin/settings", { method: "PUT", json: { weights: weights ?? q.data!.settings.weights, targetDays: days } }), onSuccess: () => { toast("ok", "Parámetros guardados"); refresh(); }, onError: (e) => toast("error", e.message) });

  if (loading) return <Spinner />;
  if (user?.role !== "admin") return (<><PageHeader title="Administración" /><Notice tone="orange">Solo administradores. {user ? "Tu rol no tiene acceso." : <Link className="underline" href="/login">Ingresar</Link>} (demo: admin@aidtrack.demo)</Notice></>);
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data!;
  const w = weights ?? o.settings.weights;
  const sumW = Object.values(w).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Administración" subtitle="Verificación de albergues, usuarios, importación de datos oficiales, parámetros y auditoría." actions={<Button variant="outline" loading={reset.isPending} onClick={() => confirm("Esto reinicia los datos de DEMOSTRACIÓN (los datos oficiales importados se conservan). ¿Continuar?") && reset.mutate()}><RotateCcw className="size-4" /> Reiniciar demo</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Albergues por verificar</CardTitle></CardHeader><CardContent>
          {o.pendingShelters.length ? <Table className="min-w-0"><thead><tr><Th>Albergue</Th><Th>Estado</Th><Th>Acción</Th></tr></thead><tbody>{o.pendingShelters.map((s) => <tr key={s.id}><Td><Link className="text-brand2 underline" href={`/albergues/${s.id}`}>{s.name}</Link><div className="text-xs text-muted">{s.district}, {s.department} · {fmtDate(s.createdAt)}</div></Td><Td><Badge tone="orange">{s.status === "pending" ? "Pendiente" : s.status}</Badge></Td><Td className="space-x-1"><Button size="sm" variant="accent" onClick={() => verify.mutate({ id: s.id, decision: "verify" })}>Verificar</Button><Button size="sm" variant="outline" onClick={() => verify.mutate({ id: s.id, decision: "reject" })}>Rechazar</Button></Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">No hay albergues pendientes.</p>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Parámetros del índice de necesidad</CardTitle></CardHeader><CardContent className="space-y-3">
          <Notice tone="orange">Ponderaciones iniciales experimentales (35/25/20/10/10), configurables. No son criterios oficiales.</Notice>
          <div className="grid grid-cols-2 gap-3">{Object.keys(W_LABEL).map((k) => <Field key={k} label={`${W_LABEL[k]} (%)`} htmlFor={`w-${k}`}><Input id={`w-${k}`} type="number" min={0} max={100} value={w[k]} onChange={(e) => setWeights({ ...w, [k]: Number(e.target.value) })} /></Field>)}<Field label="Días objetivo de abastecimiento" htmlFor="td"><Input id="td" type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field></div>
          <p className="text-xs text-muted">Suma actual: {sumW} (se renormaliza automáticamente).</p>
          <Button loading={saveW.isPending} onClick={() => saveW.mutate()}>Guardar parámetros</Button>
        </CardContent></Card>
      </div>

      <Card className="mt-5"><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5" /> Importación de datos oficiales (ETL)</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted">Detecta codificación y delimitador, valida, normaliza y evita duplicados. Reimportar no duplica registros. Catálogo actual: {o.locationsCount} distritos.</p>
        <div className="grid items-end gap-3 sm:grid-cols-[12rem_1fr_auto_auto]">
          <Field label="Fuente" htmlFor="k"><Select id="k" value={kind} onChange={(e) => setKind(e.target.value)}><option value="sinpad">SINPAD - INDECI (emergencias)</option><option value="ubigeo">UBIGEO - INEI</option></Select></Field>
          <Field label="Archivo CSV" htmlFor="f"><Input id="f" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} /> Solo validar</label>
          <Button disabled={!file} loading={imp.isPending} onClick={() => imp.mutate()}><Upload className="size-4" /> {dry ? "Validar" : "Importar"}</Button>
        </div>
        {report && (
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <p className="font-semibold">{report.source}</p>
            <p>Codificación <b>{report.encoding}</b> · delimitador <b>{JSON.stringify(report.delimiter)}</b> · filas <b>{report.totalRows}</b> · aceptadas <b className="text-accent">{report.accepted}</b> · rechazadas <b className="text-danger">{report.rejected}</b> · duplicadas <b>{report.duplicates}</b></p>
            <p className="text-xs text-muted">{Object.entries(report.summary).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
            {report.quality.length > 0 && <details><summary className="cursor-pointer">Calidad: columnas con vacíos</summary><ul className="list-disc pl-5 text-xs">{report.quality.map((c) => <li key={c.column}>{c.column}: {c.empty} vacíos</li>)}</ul></details>}
            {report.errors.length > 0 && <details><summary className="cursor-pointer">Errores ({report.rejected}{report.errorsTruncated ? ", se muestran los primeros" : ""})</summary><ul className="list-disc pl-5 text-xs">{report.errors.slice(0, 50).map((e, i) => <li key={i}>Fila {e.row}: {e.reason}</li>)}</ul></details>}
          </div>)}
        <div className="text-xs text-muted">Fuentes cargadas: {o.sources.map((s) => `${s.name} (${s.accepted}/${s.rows})`).join(" · ") || "ninguna"}</div>
      </CardContent></Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Usuarios y roles</CardTitle></CardHeader><CardContent>
          <Table className="min-w-0"><thead><tr><Th>Usuario</Th><Th>Rol</Th></tr></thead><tbody>{o.users.map((u) => (
            <tr key={u.id}><Td>{u.name}<div className="text-xs text-muted">{u.email}</div></Td><Td>
              <Select aria-label={`Rol de ${u.name}`} value={u.role} onChange={(e) => { const r = e.target.value; if (r === "shelter_coordinator") { const sid = coordShelter[u.id] || u.shelterId || prompt("ID del albergue que coordinará (ej. el de la URL /albergues/<id>)") || ""; if (!sid) return; setCoordShelter({ ...coordShelter, [u.id]: sid }); role.mutate({ id: u.id, role: r, shelterId: sid }); } else role.mutate({ id: u.id, role: r }); }}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>{u.shelterId && <div className="text-xs text-muted">Albergue: {u.shelterId}</div>}</Td></tr>))}</tbody></Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Auditoría (últimos 100)</CardTitle></CardHeader><CardContent className="max-h-96 overflow-auto">
          <ul className="space-y-1.5 text-xs">{o.audit.map((a) => <li key={a.id}><span className="text-muted">{fmtDate(a.at)}</span> · <code>{a.action}</code> · {a.entity}/{a.entityId.slice(0, 14)} · {a.actorId.slice(0, 14)}</li>)}</ul>
        </CardContent></Card>
      </div>
    </>
  );
}
