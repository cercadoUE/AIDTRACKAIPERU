"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Brain, HeartHandshake, Map as MapIcon, Route, ShieldCheck, Sigma } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { Button, Card, CardContent, Notice, Skeleton } from "@/components/ui";

const FEATURES = [
  { icon: Brain, t: "Donación en lenguaje natural", d: "Escribe o di qué quieres donar. La IA (Amazon Bedrock) extrae productos y cantidades; tú confirmas." },
  { icon: Sigma, t: "Asignación óptima (MILP)", d: "Un modelo de optimización reparte tus productos donde cubren más necesidad, respetando inventario y distancias." },
  { icon: MapIcon, t: "Mapa y ranking nacional", d: "Mapa del Perú con prioridades por color y ranking explicable, con las limitaciones de los datos a la vista." },
  { icon: Route, t: "Trazabilidad de punta a punta", d: "Del registro a la recepción confirmada, con historial de eventos, QR de seguimiento y código de entrega." },
];

export default function Home() {
  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => api<{ kpis: { sheltersTotal: number; occupants: number; pendingNeeds: number; deliveriesConfirmed: number; coverage: number | null } }>("/api/dashboard") });
  const k = d.data?.kpis;
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-border p-8 text-white sm:p-12" style={{ backgroundImage: "radial-gradient(circle at 20% 10%, rgba(22,119,255,.35), transparent 40%), radial-gradient(circle at 85% 30%, rgba(18,184,134,.28), transparent 38%), linear-gradient(135deg, #08183a, #0a2a5e 55%, #0b3b6b)" }}>
        <p className="mb-3 inline-block rounded-full bg-white/10 px-3 py-1 text-xs tracking-widest text-sky-200">PLATAFORMA NACIONAL DE AYUDA HUMANITARIA</p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Conecta lo que donas con quien más lo necesita.</h1>
        <p className="mt-4 max-w-2xl text-sky-100/90">AIDTRACK AI PERÚ une donantes, albergues y logística en un solo sistema: prioriza necesidades reales, recomienda dónde enviar cada producto y permite seguir cada donación hasta que el albergue la recibe.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link prefetch={false} href="/donar"><Button size="lg" variant="accent"><HeartHandshake className="size-5" /> QUIERO DONAR <ArrowRight className="size-4" /></Button></Link>
          <Link prefetch={false} href="/mapa"><Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Ver mapa nacional</Button></Link>
          <Link prefetch={false} href="/ranking"><Button size="lg" variant="ghost" className="text-white hover:bg-white/10">Ranking de albergues</Button></Link>
        </div>
      </section>

      <section aria-label="Cifras" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Albergues registrados", k?.sheltersTotal], ["Personas alojadas (según registros)", k ? fmtNum(k.occupants) : undefined], ["Unidades pendientes", k ? fmtNum(k.pendingNeeds) : undefined], ["Entregas confirmadas", k?.deliveriesConfirmed]].map(([l, v]) => (
          <Card key={String(l)}><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted">{l}</p>{v === undefined ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="mt-1 text-3xl font-bold">{v}</p>}</CardContent></Card>
        ))}
      </section>
      <Notice tone="violet">Esta instalación contiene <b>datos de demostración simulados</b> (albergues, inventarios y donaciones), siempre rotulados como SIMULADO. Los catálogos territoriales (INEI) y las estadísticas históricas de emergencias (INDECI/SINPAD) provienen de archivos oficiales importados.</Notice>

      <section className="grid gap-4 md:grid-cols-2">
        {FEATURES.map(({ icon: Icon, t, d: desc }) => (
          <Card key={t}><CardContent className="flex gap-4 p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand2/15 text-brand2"><Icon className="size-5" aria-hidden /></span><div><h2 className="font-semibold">{t}</h2><p className="mt-1 text-sm text-muted">{desc}</p></div></CardContent></Card>
        ))}
      </section>
      <Card><CardContent className="flex items-start gap-3 p-5 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden /><p><b>Transparencia:</b> el índice de necesidad es experimental y sus pesos son configurables. Las recomendaciones requieren la aprobación de un coordinador logístico y no prometen entregas sin logística confirmada. Los datos de contacto de los albergues están protegidos.</p></CardContent></Card>
    </div>
  );
}
