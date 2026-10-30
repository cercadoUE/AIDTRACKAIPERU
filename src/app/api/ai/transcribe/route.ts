import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { api } from "@/server/http";
import { requireActor } from "@/server/lib/auth";
import { badRequest, HttpError } from "@/server/lib/errors";

const MAX_BYTES = 960_000; // ~30 s de PCM16 mono a 16 kHz
const CHUNK = 8_192;

/**
 * Transcribe audio PCM16 mono 16 kHz con Amazon Transcribe Streaming.
 * El audio se procesa en memoria y NO se almacena. Si Transcribe no está habilitado (TRANSCRIBE != aws),
 * responde 501 y el cliente usa el reconocimiento del navegador (Web Speech API).
 */
export const POST = api(
  async (req) => {
    await requireActor(req);
    if (process.env.TRANSCRIBE !== "aws") throw new HttpError(501, "Amazon Transcribe no está habilitado en este entorno", "transcribe_disabled");
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) throw badRequest("Audio vacío");
    if (buf.length > MAX_BYTES) throw badRequest("El audio supera los 30 segundos");
    const client = new TranscribeStreamingClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1" });
    async function* audio() {
      for (let i = 0; i < buf.length; i += CHUNK) yield { AudioEvent: { AudioChunk: buf.subarray(i, i + CHUNK) } };
    }
    const out = await client.send(new StartStreamTranscriptionCommand({ LanguageCode: "es-US", MediaSampleRateHertz: 16000, MediaEncoding: "pcm", AudioStream: audio() }));
    let text = "";
    for await (const ev of out.TranscriptResultStream ?? []) {
      for (const r of ev.TranscriptEvent?.Transcript?.Results ?? []) {
        if (!r.IsPartial) text += `${r.Alternatives?.[0]?.Transcript ?? ""} `;
      }
    }
    return { text: text.trim(), engine: "amazon-transcribe", stored: false };
  },
  { limit: [6, 60_000], key: "transcribe" },
);
