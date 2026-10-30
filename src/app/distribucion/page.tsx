"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { PRODUCT_BY_KEY } from "@/server/domain/catalog";
import { STATUS_LABEL, fmtDate } from "@/lib/format";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorBox, Notice, PageHeader, SimBadge, Spinner, Table, Td, Th } from "@/components/ui";
import { useSession } from "@/components/providers";

interface Row { id: string; folio: string; status: string; createdAt: string; is_simulated: boolean; medicine: boolean; items: { product: string; quantity: number; unit: string }[] }

export default function DistribucionPage() {
  const { user, loading } = useSession();
  const allowed = user?.role === "logistics" || user?.role === "admin";
  const q = useQuery({ queryKey: ["donations"], queryFn: () => api<{ donations: Row[] }>("/api/donations"), enabled: !!allowed });
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api<{ centers: number }>("/api/dashboard") });
  const groups: [string, string[]][] = [
    ["Por revisar y asignar", ["registered", "validated"]],
    ["Pendientes de aprobación", ["assigned"]],
    ["En preparación y transporte", ["approved", "prepared", "dispatched", "in_transit"]],
    ["Entregadas", ["delivered", "received"]],
  ];
  return (
    <>
      <PageHeader title="Distribución" subtitle="Bandeja del coordinador logístico: revisa recomendaciones, aprueba asignaciones y actualiza el estado de los envíos."
        actions={<Link prefetch={false} href="/distribucion/simulador"><Button variant="outline"><FlaskConical className="size-4" /> Simulador de emergencias</Button></Link>} />
      {loading ? <Spinner /> : !user ? <Notice tone="orange">Ingresa con un rol logístico. <Link prefetch={false} className="underline" href="/login">Ingresar</Link></Notice>
        : !allowed ? <Notice tone="blue">Esta sección es para coordinación logística y administración. Puedes seguir tus donaciones en <Link prefetch={false} className="underline" href="/donaciones">Donaciones</Link>.</Notice>
        : q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : (
          <div className="space-y-5">
            <p className="text-sm text-muted">{dash.data?.centers ?? 0} centro(s) de distribución y almacenes registrados (simulados en la demostración).</p>
            {groups.map(([title, states]) => {
              const rows = q.data!.donations.filter((d) => states.includes(d.status));
              return (
                <Card key={title}><CardHeader><CardTitle>{title} <Badge className="ml-2">{rows.length}</Badge></CardTitle></CardHeader><CardContent>
                  {!rows.length ? <EmptyState title="Nada en esta etapa" /> : (
                    <Table><thead><tr><Th>Folio</Th><Th>Productos</Th><Th>Estado</Th><Th>Fecha</Th><Th><span className="sr-only">Abrir</span></Th></tr></thead>
                      <tbody>{rows.map((d) => (
                        <tr key={d.id}><Td className="font-mono">{d.folio} {d.is_simulated && <SimBadge />}</Td><Td>{d.items.map((i) => `${i.quantity} ${i.unit} ${PRODUCT_BY_KEY.get(i.product)?.label}`).join(" · ")}{d.medicine && <Badge tone="violet" className="ml-2">Medicamentos: revisión manual</Badge>}</Td><Td><Badge tone="blue">{STATUS_LABEL[d.status]}</Badge></Td><Td>{fmtDate(d.createdAt)}</Td><Td><Link prefetch={false} className="text-brand2 underline" href={`/donaciones/${d.id}`}>Revisar</Link></Td></tr>))}</tbody></Table>
                  )}
                </CardContent></Card>
              );
            })}
          </div>
        )}
    </>
  );
}
