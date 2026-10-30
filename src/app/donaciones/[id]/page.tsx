"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ShieldCheck, Truck, RefreshCw, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, STATUS_LABEL, STATUS_ORDER } from "@/lib/format";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Input, Notice, PageHeader, SimBadge, Spinner, Table, Td, Th } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";

interface Detail {
  donation: { id: string; folio: string; status: string; createdAt: string; is_simulated: boolean; medicine: boolean; channel: string; originalText?: string };
  items: { id: string; label: string; quantity: number; unit: string; reserved: number }[];
  allocations: { id: string; shelterId: string; shelterName?: string; department?: string; label: string; quantity: number; unit: string; coverage: number; distanceKm: number; explanation: string; status: string; simulated?: boolean }[];
  shipments: { id: string; code: string; status: string; shelterId: string; shelterName?: string; qr?: string; qrToken: string }[];
  events: { id: string; at: string; action: string; actorRole: string; from: string | null; to: string; notes?: string; quantities?: Record<string, number> }[];
  canApprove: boolean;
}

const NEXT: Record<string, string | undefined> = { approved: "prepared", prepared: "dispatched", dispatched: "in_transit", in_transit: "delivered" };

export default function DonacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [codes, setCodes] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["donation", id], queryFn: () => api<Detail>(`/api/donations/${id}`), enabled: !!user });
  const refresh = () => qc.invalidateQueries({ queryKey: ["donation", id] });

  const recompute = useMutation({ mutationFn: () => api(`/api/donations/${id}/recommend`, { method: "POST" }), onSuccess: () => { toast("ok", "Recomendación recalculada"); refresh(); }, onError: (e) => toast("error", e.message) });
  const approve = useMutation({
    mutationFn: () => api<{ shipments: { id: string; confirmationCode: string }[] }>(`/api/donations/${q.data!.donation.id}/approve`, { method: "POST", json: {} }),
    onSuccess: (r) => { setCodes(Object.fromEntries(r.shipments.map((s) => [s.id, s.confirmationCode]))); toast("ok", "Asignaciones aprobadas y envíos creados"); refresh(); },
    onError: (e) => toast("error", e.message),
  });
  const advance = useMutation({ mutationFn: (v: { sid: string; to: string }) => api(`/api/shipments/${v.sid}/advance`, { method: "POST", json: { to: v.to } }), onSuccess: () => { toast("ok", "Estado actualizado"); refresh(); }, onError: (e) => toast("error", e.message) });
  const confirm = useMutation({ mutationFn: (v: { sid: string; code: string }) => api(`/api/shipments/${v.sid}/confirm`, { method: "POST", json: { code: v.code } }), onSuccess: () => { toast("ok", "Recepción confirmada"); refresh(); }, onError: (e) => toast("error", e.message) });

  if (!user) return <Notice tone="orange">Ingresa para ver esta donación. <Link className="underline" href="/login">Ingresar</Link></Notice>;
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const stageIdx = STATUS_ORDER.indexOf(d.donation.status);
  const proposed = d.allocations.filter((a) => a.status === "proposed");
  const approved = d.allocations.filter((a) => a.status === "approved");

  return (
    <>
      <PageHeader title={d.donation.folio} subtitle={`Registrada el ${fmtDate(d.donation.createdAt)}`} actions={<div className="flex gap-2">{d.donation.is_simulated && <SimBadge />}<Badge tone="blue">{STATUS_LABEL[d.donation.status]}</Badge></div>} />

      <Card className="mb-5">
        <CardContent className="p-5">
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-9" aria-label="Progreso">
            {STATUS_ORDER.map((s, i) => (
              <li key={s} className={`flex flex-col items-center gap-1 text-center text-[11px] ${i <= stageIdx ? "text-accent font-semibold" : "text-muted"}`}>
                {i <= stageIdx ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {d.donation.originalText && (
            <Card>
              <CardHeader><CardTitle>Lo que escribiste</CardTitle></CardHeader>
              <CardContent><blockquote className="border-l-4 border-brand2 pl-3 text-sm italic">{d.donation.originalText}</blockquote></CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Productos donados</CardTitle></CardHeader>
            <CardContent>
              <Table><thead><tr><Th>Producto</Th><Th>Cantidad</Th><Th>Reservado</Th></tr></thead>
                <tbody>{d.items.map((i) => <tr key={i.id}><Td>{i.label}</Td><Td>{i.quantity} {i.unit}</Td><Td>{i.reserved} {i.unit}</Td></tr>)}</tbody></Table>
              {d.donation.medicine && <p className="mt-3"><Notice tone="violet">Los medicamentos se gestionan en un flujo aparte con validación de personal autorizado y no entran a la asignación automática.</Notice></p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Albergues recomendados</CardTitle>
              {proposed.length > 0 && (user.role === "donor" || d.canApprove) && <Button variant="outline" size="sm" loading={recompute.isPending} onClick={() => recompute.mutate()}><RefreshCw className="size-4" /> Recalcular</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              {d.allocations.length === 0 ? <Notice tone="blue">Aún no hay recomendaciones. No hay necesidades validadas que coincidan con tus productos, o todavía no se calcularon. <Button size="sm" variant="outline" className="ml-2" onClick={() => recompute.mutate()}>Calcular ahora</Button></Notice> : (
                <>
                  <Table><thead><tr><Th>#</Th><Th>Albergue</Th><Th>Depto.</Th><Th>Necesidad</Th><Th>Cantidad</Th><Th>Cobertura</Th><Th>Dist.</Th></tr></thead>
                    <tbody>{d.allocations.map((a, i) => (
                      <tr key={a.id}><Td>{i + 1}</Td><Td><Link className="text-brand2 underline" href={`/albergues/${a.shelterId}`}>{a.shelterName}</Link> {a.simulated && <SimBadge />}</Td><Td>{a.department}</Td><Td>{a.label}</Td><Td className="font-semibold">{a.quantity} {a.unit}</Td><Td>{Math.round(a.coverage * 100)}%</Td><Td>{a.distanceKm ? `${a.distanceKm} km` : "—"}</Td></tr>
                    ))}</tbody></Table>
                  <details className="rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">¿Por qué estas recomendaciones?</summary><ul className="mt-2 list-disc space-y-2 pl-5 text-muted">{d.allocations.map((a) => <li key={a.id}>{a.explanation}</li>)}</ul></details>
                  {proposed.length > 0 && <Notice tone="orange">Es una <b>recomendación</b>. Un coordinador logístico debe aprobarla antes del despacho; la distancia es lineal estimada, no una ruta real.</Notice>}
                  {d.canApprove && proposed.length > 0 && <Button variant="accent" loading={approve.isPending} onClick={() => approve.mutate()}><ShieldCheck className="size-4" /> Aprobar asignaciones y crear envíos</Button>}
                </>
              )}
            </CardContent>
          </Card>

          {d.shipments.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Envíos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {d.shipments.map((s) => {
                  const next = NEXT[s.status];
                  const isCoord = user.role === "shelter_coordinator" && user.shelterId === s.shelterId;
                  return (
                    <div key={s.id} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold">{s.code}</span><Badge tone={s.status === "received" ? "green" : "blue"}>{STATUS_LABEL[s.status]}</Badge></div>
                        <p className="text-sm text-muted">Destino: {s.shelterName}</p>
                        {codes[s.id] && <Notice tone="green"><KeyRound className="mr-1 inline size-4" />Código de entrega (se muestra una sola vez): <b className="font-mono text-lg tracking-widest">{codes[s.id]}</b>. Entrégalo con la carga; el albergue lo necesita para confirmar la recepción.</Notice>}
                        {d.canApprove && next && <Button size="sm" loading={advance.isPending} onClick={() => advance.mutate({ sid: s.id, to: next })}><Truck className="size-4" /> Marcar como {STATUS_LABEL[next].toLowerCase()}</Button>}
                        {isCoord && s.status === "delivered" && (
                          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); confirm.mutate({ sid: s.id, code: typed[s.id] ?? "" }); }}>
                            <div><label className="text-xs font-medium" htmlFor={`cc-${s.id}`}>Código de entrega (6 dígitos)</label><Input id={`cc-${s.id}`} inputMode="numeric" maxLength={6} pattern="\d{6}" className="w-40 font-mono tracking-widest" value={typed[s.id] ?? ""} onChange={(e) => setTyped({ ...typed, [s.id]: e.target.value.replace(/\D/g, "") })} /></div>
                            <Button type="submit" variant="accent" loading={confirm.isPending}>Confirmar recepción</Button>
                          </form>
                        )}
                      </div>
                      {s.qr && <div className="text-center"><img src={s.qr} alt={`QR de seguimiento del envío ${s.code}`} className="size-32 rounded-lg border border-border bg-white p-1" /><Link className="mt-1 block text-xs text-brand2 underline" href={`/seguimiento/${s.qrToken}`}>Abrir seguimiento</Link><p className="mt-1 max-w-32 text-[10px] text-muted">El QR solo consulta el estado. No confirma entregas.</p></div>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle>Historial de eventos</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-4 border-l-2 border-border pl-4">
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[1.4rem] top-1 size-3 rounded-full bg-brand2" />
                  <p className="text-sm font-medium">{e.action}</p>
                  <p className="text-xs text-muted">{fmtDate(e.at)} · {e.actorRole}</p>
                  <p className="text-xs text-muted">{e.from ? `${STATUS_LABEL[e.from] ?? e.from} → ` : ""}{STATUS_LABEL[e.to] ?? e.to}</p>
                  {e.notes && <p className="text-xs">{e.notes}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      {approved.length > 0 && proposed.length === 0 && null}
    </>
  );
}
