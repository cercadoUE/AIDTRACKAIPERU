"use client";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Badge, Card, CardContent, CardHeader, CardTitle, ErrorBox, Notice, PageHeader, SimBadge, Spinner } from "@/components/ui";

interface Track { code: string; statusLabel: string; shelter?: string; department?: string; donation?: string; simulated: boolean; events: { at: string; action: string; to: string }[]; notice: string }

/** Página pública del QR: solo lectura. */
export default function Seguimiento() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({ queryKey: ["track", token], queryFn: () => api<Track>(`/api/track/${token}`) });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} />;
  const t = q.data!;
  return (
    <>
      <PageHeader title={`Envío ${t.code}`} subtitle={`Donación ${t.donation} → ${t.shelter} (${t.department})`} actions={<div className="flex gap-2">{t.simulated && <SimBadge />}<Badge tone="blue">{t.statusLabel}</Badge></div>} />
      <Card className="max-w-2xl"><CardHeader><CardTitle>Estado del envío</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-3 border-l-2 border-border pl-4">{t.events.map((e, i) => <li key={i}><p className="text-sm font-medium">{e.action}</p><p className="text-xs text-muted">{fmtDate(e.at)}</p></li>)}</ol>
          <Notice tone="blue">{t.notice}</Notice>
        </CardContent></Card>
    </>
  );
}
