"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { PRODUCT_BY_KEY } from "@/server/domain/catalog";
import { STATUS_LABEL, fmtDate } from "@/lib/format";
import { Badge, Button, Card, CardContent, EmptyState, ErrorBox, PageHeader, SimBadge, Spinner, Table, Td, Th, Notice } from "@/components/ui";
import { useSession } from "@/components/providers";

interface Row { id: string; folio: string; status: string; createdAt: string; channel: string; is_simulated: boolean; medicine: boolean; items: { product: string; quantity: number; unit: string }[] }

export default function DonacionesPage() {
  const { user, loading } = useSession();
  const q = useQuery({ queryKey: ["donations"], queryFn: () => api<{ donations: Row[] }>("/api/donations"), enabled: !!user });
  return (
    <>
      <PageHeader title="Donaciones y seguimiento" subtitle={user?.role === "donor" ? "Tus donaciones registradas y su estado." : "Donaciones visibles según tu rol."}
        actions={<Link href="/donar"><Button variant="accent"><Heart className="size-4" /> Quiero donar</Button></Link>} />
      {loading ? <Spinner /> : !user ? (
        <Notice tone="orange">Ingresa para ver tus donaciones. <Link className="underline" href="/login">Ingresar</Link></Notice>
      ) : q.isLoading ? <Spinner /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.donations.length ? (
        <Card><CardContent><EmptyState title="Aún no hay donaciones" text="Registra tu primera donación por texto, voz o formulario." action={<Link href="/donar"><Button>Donar ahora</Button></Link>} /></CardContent></Card>
      ) : (
        <Table>
          <thead><tr><Th>Folio</Th><Th>Productos</Th><Th>Canal</Th><Th>Estado</Th><Th>Fecha</Th><Th><span className="sr-only">Acción</span></Th></tr></thead>
          <tbody>
            {q.data.donations.map((d) => (
              <tr key={d.id}>
                <Td className="font-mono font-medium">{d.folio} {d.is_simulated && <SimBadge />}</Td>
                <Td>{d.items.map((i) => `${i.quantity} ${i.unit} ${PRODUCT_BY_KEY.get(i.product)?.label ?? i.product}`).join(" · ")}{d.medicine && <Badge tone="violet" className="ml-2">Medicamentos</Badge>}</Td>
                <Td>{({ text: "Texto", voice: "Voz", form: "Formulario" } as Record<string, string>)[d.channel]}</Td>
                <Td><Badge tone={d.status === "received" ? "green" : d.status === "registered" ? "gray" : "blue"}>{STATUS_LABEL[d.status]}</Badge></Td>
                <Td>{fmtDate(d.createdAt)}</Td>
                <Td><Link className="text-brand2 underline" href={`/donaciones/${d.id}`}>Ver</Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
