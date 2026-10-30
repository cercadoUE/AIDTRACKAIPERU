"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2, CheckCircle2, Pill } from "lucide-react";
import { api } from "@/lib/api";
import { CATEGORIES, DEPARTMENTS, PRODUCTS, PRODUCT_BY_KEY } from "@/server/domain/catalog";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Field, Input, Notice, Select } from "./ui";
import { useSession, useToast } from "./providers";

export interface DraftItem {
  key: string;
  category: string;
  product: string;
  quantity: number | null;
  unit: string; // unidad detectada (puede diferir de la canónica)
  needsConfirmation: boolean;
  note?: string;
  confirmed: boolean;
  condition?: string;
  expiresAt?: string;
}

let n = 0;
export const newDraft = (p: Partial<DraftItem> = {}): DraftItem => ({ key: `i${n++}`, category: "agua", product: "agua_potable", quantity: null, unit: "litros", needsConfirmation: false, confirmed: true, ...p });

/** Convierte lo detectado por la IA en filas editables. Las ambiguas arrancan sin cantidad y sin confirmar. */
export function toDrafts(parsed: { category: string; product: string; quantity: number | null; unit: string; needsConfirmation: boolean; note?: string }[]): DraftItem[] {
  return parsed.map((p) => {
    const canonical = PRODUCT_BY_KEY.get(p.product)?.unit ?? p.unit;
    const mismatch = p.unit !== canonical;
    return newDraft({ ...p, quantity: mismatch ? null : p.quantity, note: mismatch && p.quantity !== null ? `${p.note ?? ""} Dijiste ${p.quantity} ${p.unit}; ingresa la cantidad en ${canonical}.`.trim() : p.note, confirmed: !p.needsConfirmation });
  });
}

export function DonationEditor({ initial, originalText, channel, location, departmentCode }: { initial: DraftItem[]; originalText?: string; channel: "text" | "voice" | "form"; location?: string | null; departmentCode?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();
  const [items, setItems] = React.useState<DraftItem[]>(initial);
  const [dept, setDept] = React.useState(departmentCode ?? "");
  const [transport, setTransport] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);
  // `initial` solo siembra el estado: el padre remonta el editor con `key` cuando llega una nueva interpretación.

  const set = (key: string, patch: Partial<DraftItem>) => setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const hasMedicine = items.some((i) => PRODUCT_BY_KEY.get(i.product)?.medicine);

  const submit = useMutation({
    onError: (e) => toast("error", `No se pudo registrar: ${e.message}`),
    mutationFn: async () => {
      const created = await api<{ donation: { id: string; folio: string } }>("/api/donations", {
        method: "POST",
        json: {
          channel, originalText, locationText: location ?? undefined, departmentCode: dept || undefined, transportAvailable: transport, confirmed: true,
          items: items.map((i) => ({ category: i.category, product: i.product, quantity: i.quantity, unit: PRODUCT_BY_KEY.get(i.product)!.unit, condition: i.condition || undefined, expiresAt: i.expiresAt || undefined })),
        },
      });
      await api(`/api/donations/${created.donation.id}/recommend`, { method: "POST" }).catch(() => null);
      return created.donation;
    },
    onSuccess: (d) => {
      sessionStorage.removeItem("aidtrack-donacion-texto");
      toast("ok", `Donación ${d.folio} registrada`);
      router.push(`/donaciones/${d.id}`);
    },
  });

  const validate = () => {
    const errs: string[] = [];
    if (!items.length) errs.push("Agrega al menos un producto.");
    items.forEach((i, idx) => {
      const label = PRODUCT_BY_KEY.get(i.product)?.label ?? i.product;
      if (i.quantity === null || !(i.quantity > 0)) errs.push(`Fila ${idx + 1} (${label}): ingresa una cantidad mayor que 0.`);
      else if (i.needsConfirmation && !i.confirmed) errs.push(`Fila ${idx + 1} (${label}): confirma que la cantidad es correcta.`);
    });
    setErrors(errs);
    return errs.length === 0;
  };

  if (!user) {
    return (
      <Notice tone="orange">
        Para registrar tu donación necesitas iniciar sesión. <Link prefetch={false} className="font-semibold underline" href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/donar" : window.location.pathname)}`}>Ingresa</Link> o <Link prefetch={false} className="font-semibold underline" href="/registro">crea una cuenta</Link>; al volver, tu texto seguirá aquí para analizarlo de nuevo.
      </Notice>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revisa y confirma tu donación</CardTitle>
        <p className="text-sm text-muted">Nada se registra hasta que confirmes. Corrige lo que sea necesario.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {items.map((i, idx) => {
            const def = PRODUCT_BY_KEY.get(i.product);
            const warn = i.needsConfirmation;
            return (
              <div key={i.key} className={`rounded-xl border p-3 ${warn && !i.confirmed ? "border-warn bg-warn/5" : "border-border"}`}>
                <div className="grid gap-3 sm:grid-cols-[1.2fr_1.4fr_1fr_auto]">
                  <Field label="Categoría" htmlFor={`c-${i.key}`}>
                    <Select id={`c-${i.key}`} value={i.category} onChange={(e) => { const cat = e.target.value; const p = PRODUCTS.find((x) => x.category === cat)!; set(i.key, { category: cat, product: p.key, unit: p.unit }); }}>
                      {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  <Field label="Producto" htmlFor={`p-${i.key}`}>
                    <Select id={`p-${i.key}`} value={i.product} onChange={(e) => set(i.key, { product: e.target.value, unit: PRODUCT_BY_KEY.get(e.target.value)!.unit })}>
                      {PRODUCTS.filter((p) => p.category === i.category).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </Select>
                  </Field>
                  <Field label={`Cantidad (${def?.unit})`} htmlFor={`q-${i.key}`}>
                    <Input id={`q-${i.key}`} type="number" min={0} step="any" inputMode="decimal" value={i.quantity ?? ""} placeholder="Ej. 50"
                      onChange={(e) => set(i.key, { quantity: e.target.value === "" ? null : Number(e.target.value), confirmed: i.needsConfirmation ? false : true })} />
                  </Field>
                  <div className="flex items-end"><Button variant="ghost" aria-label={`Quitar fila ${idx + 1}`} onClick={() => setItems((s) => s.filter((x) => x.key !== i.key))}><Trash2 className="size-4 text-danger" /></Button></div>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field label="Condición" htmlFor={`d-${i.key}`}>
                    <Select id={`d-${i.key}`} value={i.condition ?? ""} onChange={(e) => set(i.key, { condition: e.target.value })}>
                      <option value="">No especificada</option><option value="nuevo">Nuevo</option><option value="usado_buen_estado">Usado en buen estado</option>
                    </Select>
                  </Field>
                  {(i.category === "alimentos" || i.category === "agua" || i.category === "bebes") && (
                    <Field label="Fecha de vencimiento" htmlFor={`e-${i.key}`}><Input id={`e-${i.key}`} type="date" value={i.expiresAt ?? ""} onChange={(e) => set(i.key, { expiresAt: e.target.value })} /></Field>
                  )}
                </div>
                {warn && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <AlertTriangle className="size-4 text-warn" aria-hidden />
                    <span>{i.note ?? "Cantidad ambigua: revísala."}</span>
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={i.confirmed} onChange={(e) => set(i.key, { confirmed: e.target.checked })} /> Confirmo esta cantidad</label>
                  </div>
                )}
                {def?.medicine && <p className="mt-2 flex items-center gap-2 text-sm text-violet-600"><Pill className="size-4" /> Los medicamentos no se asignan automáticamente: requieren validación de personal autorizado.</p>}
              </div>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => setItems((s) => [...s, newDraft()])}><Plus className="size-4" /> Agregar producto</Button>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Departamento de origen" htmlFor="dept" hint={location ? `Detectado: ${location}` : "Se usa para calcular distancias estimadas."}>
            <Select id="dept" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Sin especificar</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={transport} onChange={(e) => setTransport(e.target.checked)} /> Puedo llevar la donación o coordinar transporte</label>
        </div>
        {hasMedicine && <Notice tone="violet">Esta donación incluye medicamentos. Quedará registrada para revisión de una organización autorizada y no entrará al reparto automático.</Notice>}
        {errors.length > 0 && <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"><ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        {submit.error && <ErrorBox error={submit.error} />}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">Al confirmar, el sistema calcula una recomendación. Un coordinador logístico debe aprobar el despacho.</p>
          <Button variant="accent" size="lg" loading={submit.isPending} onClick={() => validate() && submit.mutate()}>{!submit.isPending && <CheckCircle2 className="size-5" />} {submit.isPending ? "Registrando y calculando recomendación…" : "Confirmar y registrar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
