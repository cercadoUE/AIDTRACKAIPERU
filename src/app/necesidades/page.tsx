"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NEED_STATUS, URGENCY, fmtDate, fmtNum } from "@/lib/format";
import { Badge, EmptyState, ErrorBox, Notice, PageHeader, SimBadge, Spinner, Table, Td, Th, Button, Card, CardContent } from "@/components/ui";
import { useSession } from "@/components/providers";

interface Need { id: string; shelterId: string; shelterName?: string; department?: string; productLabel: string; quantity: number | null; fulfilled: number; reserved: number; unit: string; urgency: string; status: string; updatedAt: string; simulated: boolean; notes?: string }

export default function NecesidadesPage() {
  const { user, loading } = useSession();
  const q = useQuery({ queryKey: ["needs"], queryFn: () => api<{ needs: Need[]; shelters: { id: string; name: string }[] }>("/api/needs"), enabled: !!user && user.role !== "donor" });
  return (
    <>
      <PageHeader title="Solicitudes y necesidades" subtitle="Estados: borrador, pendiente, validada, parcialmente atendida, atendida y cerrada. Para registrar una solicitud entra a la ficha de tu albergue." />
      {loading ? <Spinner /> : !user ? <Notice tone="orange">Ingresa para ver las solicitudes. <Link className="underline" href="/login">Ingresar</Link></Notice>
        : user.role === "donor" ? <Notice tone="blue">Las solicitudes las gestionan coordinadores de albergue, logística y administración. Puedes ver las necesidades de cada albergue en su ficha o en el <Link className="underline" href="/ranking">ranking</Link>.</Notice>
        : q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : (
          <>
            {user.role === "shelter_coordinator" && user.shelterId && (
              <Card className="mb-4"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">Registra nuevas necesidades en lenguaje natural desde la ficha de tu albergue.</p><Link href={`/albergues/${user.shelterId}`}><Button>Registrar necesidades</Button></Link></CardContent></Card>
            )}
            {!q.data?.needs.length ? <EmptyState title="Sin solicitudes" /> : (
              <Table className="min-w-[860px]">
                <thead><tr><Th>Albergue</Th><Th>Producto</Th><Th>Solicitado</Th><Th>Atendido</Th><Th>Urgencia</Th><Th>Estado</Th><Th>Actualizado</Th></tr></thead>
                <tbody>{q.data.needs.map((n) => (
                  <tr key={n.id}><Td><Link className="text-brand2 underline" href={`/albergues/${n.shelterId}`}>{n.shelterName}</Link> {n.simulated && <SimBadge />}<div className="text-xs text-muted">{n.department}</div></Td><Td>{n.productLabel}</Td>
                    <Td>{n.quantity === null ? <Badge tone="orange">Por confirmar</Badge> : `${fmtNum(n.quantity)} ${n.unit}`}</Td><Td>{fmtNum(n.fulfilled)}{n.reserved > 0 && <span className="text-xs text-muted"> (+{n.reserved} reservado)</span>}</Td>
                    <Td>{URGENCY[n.urgency]}</Td><Td><Badge tone={n.status === "validated" ? "blue" : n.status === "fulfilled" ? "green" : "gray"}>{NEED_STATUS[n.status]}</Badge></Td><Td className="text-xs">{fmtDate(n.updatedAt)}</Td></tr>))}</tbody>
              </Table>
            )}
          </>
        )}
    </>
  );
}
