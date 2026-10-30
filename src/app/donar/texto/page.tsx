"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Send } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, CardContent, Button, Textarea, ErrorBox, Notice, Badge } from "@/components/ui";
import { DonationEditor, toDrafts, type DraftItem } from "@/components/donation-editor";

type Parsed = { donations: Parameters<typeof toDrafts>[0]; location: string | null; departmentCode?: string | null; warnings: string[]; source: "rules" | "bedrock" };

const DRAFT_KEY = "aidtrack-donacion-texto";
const EXAMPLE = "Tengo 50 litros de agua, 30 kilos de arroz, 20 frazadas y 15 kits de higiene. Estoy en Lima y quiero ayudar a los albergues que más lo necesitan.";

export default function DonarTexto() {
  const [text, setText] = React.useState("");
  const restored = React.useRef(false);
  // Restaura el borrador tras el montaje (no en el render) para no romper la hidratación.
  React.useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    restored.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza una sola vez con sessionStorage (sistema externo)
    if (saved) setText(saved);
  }, []);
  React.useEffect(() => { if (restored.current) sessionStorage.setItem(DRAFT_KEY, text); }, [text]);
  const [drafts, setDrafts] = React.useState<DraftItem[] | null>(null);
  const [parsed, setParsed] = React.useState<Parsed | null>(null);

  const parse = useMutation({
    mutationFn: () => api<{ result: Parsed }>("/api/ai/parse-donation", { method: "POST", json: { text } }),
    onSuccess: ({ result }) => { setParsed(result); setDrafts(toDrafts(result.donations)); },
  });

  return (
    <>
      <PageHeader title="Donar con texto" subtitle="Cuéntanos qué quieres donar. La IA propone los datos y tú los confirmas." />
      <div className="space-y-5">
        <Card>
          <CardContent className="space-y-3 p-5">
            <label htmlFor="msg" className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-brand2" aria-hidden /> Describe tu donación</label>
            <Textarea id="msg" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-xs text-brand2 underline" onClick={() => setText(EXAMPLE)}>Usar ejemplo</button>
              <Button loading={parse.isPending} disabled={text.trim().length < 3} onClick={() => parse.mutate()}>{!parse.isPending && <Send className="size-4" />} {parse.isPending ? "Analizando…" : "Analizar donación"}</Button>
            </div>
            {parse.isPending && <p role="status" className="flex items-center gap-2 text-sm text-brand2"><Sparkles className="size-4 animate-pulse" aria-hidden /> Analizando tu donación con IA, puede tardar unos segundos…</p>}
            {parse.error && <ErrorBox error={`No pudimos analizar el texto: ${parse.error.message}. Intenta de nuevo o usa el formulario.`} />}
            {text.trim().length > 0 && text.trim().length < 3 && <p className="text-xs text-muted">Escribe al menos 3 caracteres.</p>}
          </CardContent>
        </Card>

        {parsed && drafts && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={parsed.source === "bedrock" ? "blue" : "gray"}>{parsed.source === "bedrock" ? "Interpretado con Amazon Bedrock" : "Intérprete básico (sin IA generativa)"}</Badge>
              {parsed.warnings.map((w) => <Badge key={w} tone="orange">{w}</Badge>)}
            </div>
            {drafts.length === 0 ? <Notice tone="orange">No reconocí productos. Reescribe el mensaje o usa el <a className="underline" href="/donar/formulario">formulario</a>.</Notice> : (
              <DonationEditor key={drafts.map((d) => d.key).join("|")} initial={drafts} originalText={text} channel="text" location={parsed.location} departmentCode={parsed.departmentCode} />
            )}
          </>
        )}
      </div>
    </>
  );
}
