"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button, Card, CardContent, ErrorBox, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { useSession, useToast } from "@/components/providers";

const schema = z.object({
  name: z.string().min(3, "Mínimo 3 caracteres").max(120),
  departmentCode: z.string().regex(/^\d{2}$/, "Selecciona un departamento"),
  provinceCode: z.string().min(1, "Selecciona una provincia"),
  ubigeo: z.string().regex(/^\d{6}$/, "Selecciona un distrito"),
  address: z.string().min(3, "Ingresa la dirección").max(200),
  lat: z.number({ message: "Latitud inválida" }).min(-19, "Fuera del Perú").max(0.5, "Fuera del Perú"),
  lng: z.number({ message: "Longitud inválida" }).min(-82, "Fuera del Perú").max(-68, "Fuera del Perú"),
  capacity: z.number({ message: "Número inválido" }).int().min(1, "Mínimo 1"),
  occupants: z.number({ message: "Número inválido" }).int().min(0),
  families: z.number({ message: "Número inválido" }).int().min(0),
  type: z.string().min(2, "Indica el tipo"),
  contactName: z.string().max(80).optional(),
  contactPhone: z.string().max(30).optional(),
}).refine((v) => v.occupants <= v.capacity, { path: ["occupants"], message: "No puede superar la capacidad" });
type FormValues = z.infer<typeof schema>;

export default function RegistrarAlbergue() {
  const { user } = useSession();
  const router = useRouter();
  const toast = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) as never, defaultValues: { type: "Albergue temporal", occupants: 0, families: 0 } });
  const { register, watch, setValue, formState: { errors } } = form;
  const dept = watch("departmentCode");
  const prov = watch("provinceCode");
  const depts = useQuery({ queryKey: ["geo"], queryFn: () => api<{ departments: { code: string; name: string }[] }>("/api/geo") });
  const provs = useQuery({ queryKey: ["geo", dept], enabled: !!dept, queryFn: () => api<{ provinces: { code: string; name: string }[] }>(`/api/geo?department=${dept}`) });
  const dists = useQuery({ queryKey: ["geo", dept, prov], enabled: !!dept && !!prov, queryFn: () => api<{ districts: { ubigeo: string; name: string }[] }>(`/api/geo?department=${dept}&province=${prov}`) });

  const create = useMutation({
    mutationFn: async (v: FormValues) => {
      const province = provs.data?.provinces.find((p) => p.code === v.provinceCode)?.name ?? "";
      const district = dists.data?.districts.find((d) => d.ubigeo === v.ubigeo)?.name ?? "";
      return api<{ shelter: { id: string } }>("/api/shelters", { method: "POST", json: { ...v, provinceCode: undefined, province, district } });
    },
    onSuccess: (r) => { toast("ok", "Albergue registrado. Queda pendiente de verificación por un administrador."); router.push(`/albergues/${r.shelter.id}`); },
  });

  if (!user) return <Notice tone="orange">Para registrar un albergue necesitas una cuenta. <Link className="underline" href="/login">Ingresar</Link> · <Link className="underline" href="/registro">Crear cuenta</Link></Notice>;
  const num = (name: keyof FormValues) => register(name, { setValueAs: (v) => (v === "" || v === undefined ? undefined : Number(v)) });
  return (
    <>
      <PageHeader title="Registrar albergue" subtitle="Los datos se usan para calcular prioridades y recomendar donaciones. El albergue quedará pendiente hasta que un administrador lo verifique." />
      <Card><CardContent className="p-5">
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="grid gap-4 md:grid-cols-2" noValidate>
          <div className="md:col-span-2"><Field label="Nombre del albergue" htmlFor="name" error={errors.name?.message}><Input id="name" {...register("name")} /></Field></div>
          <Field label="Departamento" htmlFor="dep" error={errors.departmentCode?.message}><Select id="dep" {...register("departmentCode", { onChange: () => { setValue("provinceCode", ""); setValue("ubigeo", ""); } })}><option value="">Selecciona…</option>{depts.data?.departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select></Field>
          <Field label="Provincia" htmlFor="prov" error={errors.provinceCode?.message}><Select id="prov" disabled={!dept} {...register("provinceCode", { onChange: () => setValue("ubigeo", "") })}><option value="">Selecciona…</option>{provs.data?.provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
          <Field label="Distrito (UBIGEO INEI)" htmlFor="ubigeo" error={errors.ubigeo?.message} hint="El catálogo proviene del INEI."><Select id="ubigeo" disabled={!prov} {...register("ubigeo")}><option value="">Selecciona…</option>{dists.data?.districts.map((d) => <option key={d.ubigeo} value={d.ubigeo}>{d.name} ({d.ubigeo})</option>)}</Select></Field>
          <Field label="Dirección o referencia" htmlFor="address" error={errors.address?.message}><Input id="address" {...register("address")} /></Field>
          <Field label="Latitud" htmlFor="lat" error={errors.lat?.message} hint="Ej. -5.1945 (usa un mapa para obtenerla)."><Input id="lat" type="number" step="any" {...num("lat")} /></Field>
          <Field label="Longitud" htmlFor="lng" error={errors.lng?.message} hint="Ej. -80.6328"><Input id="lng" type="number" step="any" {...num("lng")} /></Field>
          <Field label="Capacidad máxima (personas)" htmlFor="capacity" error={errors.capacity?.message}><Input id="capacity" type="number" min={1} {...num("capacity")} /></Field>
          <Field label="Personas alojadas" htmlFor="occupants" error={errors.occupants?.message}><Input id="occupants" type="number" min={0} {...num("occupants")} /></Field>
          <Field label="Familias alojadas" htmlFor="families" error={errors.families?.message}><Input id="families" type="number" min={0} {...num("families")} /></Field>
          <Field label="Tipo de establecimiento" htmlFor="type" error={errors.type?.message}><Input id="type" {...register("type")} /></Field>
          <Field label="Responsable (opcional)" htmlFor="cn" hint="Dato personal: no se muestra públicamente."><Input id="cn" autoComplete="off" {...register("contactName")} /></Field>
          <Field label="Teléfono del responsable (opcional)" htmlFor="cp" hint="Solo lo verán administradores, logística y el propio albergue."><Input id="cp" inputMode="tel" autoComplete="off" {...register("contactPhone")} /></Field>
          <div className="space-y-3 md:col-span-2">
            {create.error && <ErrorBox error={create.error} />}
            <Button type="submit" size="lg" loading={create.isPending}>Registrar albergue</Button>
          </div>
        </form>
      </CardContent></Card>
    </>
  );
}
