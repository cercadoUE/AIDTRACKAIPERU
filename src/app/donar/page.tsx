import Link from "next/link";
import { FileText, Mic, MessageSquareText, Pill } from "lucide-react";
import { PageHeader, Card, CardContent, Notice } from "@/components/ui";

const OPTIONS = [
  { href: "/donar/texto", icon: MessageSquareText, title: "Donar con texto", text: "Escribe lo que tienes, como si hablaras con un asistente. La IA extrae productos y cantidades y tú confirmas.", color: "from-blue-500 to-cyan-400" },
  { href: "/donar/voz", icon: Mic, title: "Donar con voz", text: "Presiona el micrófono y di qué quieres donar. Revisas la transcripción antes de continuar. No guardamos el audio.", color: "from-emerald-500 to-teal-400" },
  { href: "/donar/formulario", icon: FileText, title: "Formulario tradicional", text: "Elige categoría, producto, cantidad, condición y ubicación paso a paso.", color: "from-indigo-500 to-blue-400" },
];

export default async function DonarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const albergue = typeof sp.albergue === "string" && /^[\w-]{1,60}$/.test(sp.albergue) ? sp.albergue : null;
  const suffix = albergue ? `?albergue=${albergue}` : "";
  return (
    <>
      <PageHeader title="Quiero donar" subtitle="Elige cómo registrar tu donación. En todos los casos revisas y confirmas los datos antes de guardar." />
      {albergue && <div className="mb-4"><Notice tone="blue">Quieres ayudar a un albergue en particular. Registra tus productos y el sistema evaluará si ese albergue los necesita, junto con otros que puedan necesitarlos más.</Notice></div>}
      <div className="grid gap-4 md:grid-cols-3">
        {OPTIONS.map(({ href, icon: Icon, title, text, color }) => (
          <Link key={href} href={`${href}${suffix}`} className="group focus-visible:outline-2 focus-visible:outline-brand2 rounded-2xl">
            <Card className="h-full transition group-hover:-translate-y-1 group-hover:shadow-lg">
              <CardContent className="space-y-3 p-6">
                <span className={`grid size-14 place-items-center rounded-2xl bg-gradient-to-br ${color} text-white shadow`}><Icon className="size-7" aria-hidden /></span>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-sm text-muted">{text}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <Notice tone="violet"><Pill className="mr-1 inline size-4" /> <b>Medicamentos:</b> se registran en un flujo aparte, con validación de organizaciones y profesionales autorizados. No se asignan automáticamente.</Notice>
        <Notice tone="blue">Tu donación genera una <b>recomendación</b> de albergues. Un coordinador logístico la revisa y aprueba el despacho; el sistema no promete entregas sin logística confirmada.</Notice>
      </div>
    </>
  );
}
