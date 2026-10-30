"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Mic, Square, Loader2, CheckCircle2, Sparkles, Hourglass } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Card, CardContent, Button, Textarea, ErrorBox, Notice, Badge } from "@/components/ui";
import { DonationEditor, toDrafts, type DraftItem } from "@/components/donation-editor";
import { cn } from "@/lib/utils";
import { withBase } from "@/lib/base-path";

type Stage = "idle" | "recording" | "processing" | "analyzing" | "confirming";
type Parsed = { donations: Parameters<typeof toDrafts>[0]; location: string | null; departmentCode?: string | null; warnings: string[]; source: "rules" | "bedrock" };

/* Tipos mínimos de la Web Speech API (no están en lib.dom). */
interface SpeechRec { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null; onerror: ((e: { error: string }) => void) | null; start(): void; stop(): void }
type SpeechCtor = new () => SpeechRec;

const MAX_SECONDS = 30;
const noopSubscribe = () => () => {};
const hasSpeechApi = () => { const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; return !!(w.SpeechRecognition || w.webkitSpeechRecognition); };
const STEPS: { id: Stage; label: string; icon: React.ElementType }[] = [
  { id: "recording", label: "Grabando", icon: Mic },
  { id: "processing", label: "Procesando audio", icon: Loader2 },
  { id: "analyzing", label: "Analizando donación", icon: Sparkles },
  { id: "confirming", label: "Esperando confirmación", icon: Hourglass },
];

function toPcm16(chunks: Float32Array[], inputRate: number): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Float32Array(len);
  let o = 0;
  for (const c of chunks) { merged.set(c, o); o += c.length; }
  const ratio = inputRate / 16000;
  const outLen = Math.floor(len / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

export default function DonarVoz() {
  const [stage, setStage] = React.useState<Stage>("idle");
  const [transcript, setTranscript] = React.useState("");
  const [engine, setEngine] = React.useState<string>("");
  const [seconds, setSeconds] = React.useState(0);
  const [micError, setMicError] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [drafts, setDrafts] = React.useState<DraftItem[] | null>(null);

  const rec = React.useRef<{ ctx?: AudioContext; stream?: MediaStream; proc?: ScriptProcessorNode; chunks: Float32Array[]; sr?: SpeechRec; live: string; timer?: ReturnType<typeof setInterval> }>({ chunks: [], live: "" });
  // En el servidor no hay window: se lee con useSyncExternalStore para que la hidratación coincida.
  const speechSupported = React.useSyncExternalStore(noopSubscribe, hasSpeechApi, () => false);

  const analyze = useMutation({
    mutationFn: (text: string) => api<{ result: Parsed }>("/api/ai/parse-donation", { method: "POST", json: { text } }),
    onSuccess: ({ result }) => { setParsed(result); setDrafts(toDrafts(result.donations)); setStage("confirming"); },
    onError: () => setStage("idle"),
  });

  const cleanup = React.useCallback(() => {
    const r = rec.current;
    if (r.timer) clearInterval(r.timer);
    r.proc?.disconnect();
    r.stream?.getTracks().forEach((t) => t.stop());
    r.ctx?.close().catch(() => {});
    try { r.sr?.stop(); } catch { /* ya detenido */ }
  }, []);
  React.useEffect(() => cleanup, [cleanup]);

  async function start() {
    setMicError(null); setParsed(null); setDrafts(null); setTranscript(""); setEngine("");
    if (!navigator.mediaDevices?.getUserMedia) { setMicError("Tu navegador no permite grabar audio. Escribe tu donación en la pestaña de texto."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      rec.current = { ctx, stream, proc, chunks: [], live: "" };
      proc.onaudioprocess = (e) => rec.current.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);

      const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
      const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (Ctor) {
        const sr = new Ctor();
        sr.lang = "es-PE"; sr.continuous = true; sr.interimResults = true;
        sr.onresult = (e) => {
          let finalText = "";
          for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
          rec.current.live = finalText.trim();
          const interim = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(" ");
          setTranscript(interim);
        };
        sr.onerror = () => {};
        sr.start();
        rec.current.sr = sr;
      }
      setSeconds(0); setStage("recording");
      rec.current.timer = setInterval(() => setSeconds((s) => { if (s + 1 >= MAX_SECONDS) stop(); return s + 1; }), 1000);
    } catch (e) {
      const name = (e as DOMException).name;
      setMicError(name === "NotAllowedError" ? "Permiso de micrófono denegado. Habilítalo en tu navegador o dona con texto." : name === "NotFoundError" ? "No se encontró un micrófono." : "No se pudo iniciar la grabación.");
    }
  }

  async function stop() {
    const r = rec.current;
    if (!r.ctx) return;
    setStage("processing");
    const sampleRate = r.ctx.sampleRate;
    const chunks = r.chunks;
    const live = r.live;
    cleanup();
    let text = "";
    try {
      const pcm = toPcm16(chunks, sampleRate);
      if (pcm.length > 3200) {
        const res = await fetch(withBase("/api/ai/transcribe"), { method: "POST", body: pcm as BodyInit, headers: { "content-type": "application/octet-stream" } });
        if (res.ok) { const j = await res.json(); text = j.text; setEngine("Amazon Transcribe"); }
      }
    } catch { /* se usa el respaldo */ }
    if (!text) { text = live || transcript; if (text) setEngine("Reconocimiento del navegador (Web Speech API)"); }
    setTranscript(text);
    setStage("idle");
    if (!text) setMicError(speechSupported ? "No se entendió el audio. Intenta de nuevo, más cerca del micrófono." : "Este navegador no incluye reconocimiento de voz y Amazon Transcribe no está habilitado aquí. Escribe tu mensaje abajo o usa Chrome/Edge.");
  }

  const idx = STEPS.findIndex((s) => s.id === stage);
  const recording = stage === "recording";

  return (
    <>
      <PageHeader title="Donar con voz" subtitle="Presiona el micrófono y di qué quieres donar. Verás la transcripción y podrás corregirla antes de continuar." />
      <div className="space-y-5">
        <Card>
          <CardContent className="flex flex-col items-center gap-5 p-8">
            <button onClick={recording ? stop : start} disabled={stage === "processing" || analyze.isPending}
              aria-label={recording ? "Detener grabación" : "Iniciar grabación"}
              className={cn("relative grid size-28 place-items-center rounded-full text-white shadow-xl transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand2 disabled:opacity-50", recording ? "bg-danger text-danger rec-ring" : "bg-gradient-to-br from-brand2 to-accent")}>
              <span className="relative z-10 text-white">{recording ? <Square className="size-10" /> : <Mic className="size-12" />}</span>
            </button>
            <p className="text-sm text-muted">{recording ? `Grabando… ${seconds}s / ${MAX_SECONDS}s. Presiona para terminar.` : "Presiona para empezar a hablar (máx. 30 s)."}</p>
            <ol className="flex flex-wrap justify-center gap-2" aria-label="Estado">
              {STEPS.map((s, i) => {
                const done = idx > i || (stage === "idle" && !!drafts && i < 3);
                const cur = idx === i;
                const Icon = done ? CheckCircle2 : s.icon;
                return <li key={s.id}><Badge tone={cur ? "blue" : done ? "green" : "gray"}><Icon className={cn("size-3.5", cur && s.id !== "recording" && "animate-spin")} /> {s.label}</Badge></li>;
              })}
            </ol>
            
            {micError && <ErrorBox error={micError} />}
            <p className="text-center text-xs text-muted">Privacidad: el audio se procesa en el momento y <b>no se guarda</b>. {speechSupported ? "Si Amazon Transcribe no está disponible se usa el reconocimiento de tu navegador, que puede enviar el audio al proveedor del navegador." : "Tu navegador no incluye reconocimiento de voz; sin Amazon Transcribe deberás escribir el mensaje."}</p>
          </CardContent>
        </Card>

        {!recording && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between"><label htmlFor="tr" className="text-sm font-medium">{transcript ? "Transcripción (puedes corregirla)" : "¿Sin micrófono? Escribe aquí lo que dirías"}</label>{engine && <Badge tone="gray">{engine}</Badge>}</div>
              <Textarea id="tr" rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Ej.: Tengo cien botellas de agua y cincuenta paquetes de arroz para donar." />
              {analyze.error && <ErrorBox error={`No pudimos analizar el mensaje: ${analyze.error instanceof ApiError ? analyze.error.message : String(analyze.error)}. Intenta de nuevo o usa el formulario.`} />}
              <div className="flex justify-end"><Button loading={analyze.isPending} disabled={transcript.trim().length < 3} onClick={() => { setStage("analyzing"); analyze.mutate(transcript); }}>{!analyze.isPending && <Sparkles className="size-4" />} {analyze.isPending ? "Analizando…" : "Analizar donación"}</Button></div>
            </CardContent>
          </Card>
        )}

        {parsed && drafts && (
          drafts.length === 0 ? <Notice tone="orange">No reconocí productos en el mensaje. Corrige la transcripción o usa el formulario.</Notice> : (
            <>
              <div className="flex flex-wrap gap-2">{parsed.warnings.map((w) => <Badge key={w} tone="orange">{w}</Badge>)}<Badge tone={parsed.source === "bedrock" ? "blue" : "gray"}>{parsed.source === "bedrock" ? "Interpretado con Amazon Bedrock" : "Intérprete básico"}</Badge></div>
              <DonationEditor key={drafts.map((d) => d.key).join("|")} initial={drafts} originalText={transcript} channel="voice" location={parsed.location} departmentCode={parsed.departmentCode} />
            </>
          )
        )}
      </div>
    </>
  );
}
