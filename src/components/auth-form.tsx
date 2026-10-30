"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorBox, Field, Input, Notice } from "./ui";

const loginSchema = z.object({ email: z.string().trim().min(1, "Ingresa tu usuario o correo"), password: z.string().min(1, "Ingresa tu contraseña") });
const registerSchema = z.object({
  name: z.string().min(2, "Ingresa tu nombre"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

/** La contraseña demo solo se muestra si se define al compilar (NEXT_PUBLIC_DEMO_PASSWORD); nunca vive en el código. */
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

const DEMO = [
  ["Donante", "donante@aidtrack.demo"], ["Coordinador de albergue", "coordinador@aidtrack.demo"],
  ["Coordinador logístico", "logistica@aidtrack.demo"], ["Administrador", "admin@aidtrack.demo"],
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const isLogin = mode === "login";
  const form = useForm<{ name?: string; email: string; password: string }>({ resolver: zodResolver(isLogin ? loginSchema : registerSchema) as never });
  const m = useMutation({
    mutationFn: (v: { name?: string; email: string; password: string }) => api(`/api/auth/${mode}`, { method: "POST", json: v }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.push("/donar");
      router.refresh();
    },
  });
  const e = form.formState.errors;
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader><CardTitle className="text-xl">{isLogin ? "Ingresar" : "Crear cuenta de donante"}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
            {!isLogin && <Field label="Nombre" htmlFor="name" error={e.name?.message}><Input id="name" autoComplete="name" {...form.register("name")} /></Field>}
            <Field label={isLogin ? "Usuario o correo" : "Correo"} htmlFor="email" error={e.email?.message}><Input id="email" type={isLogin ? "text" : "email"} autoComplete={isLogin ? "username" : "email"} {...form.register("email")} /></Field>
            <Field label="Contraseña" htmlFor="password" error={e.password?.message} hint={isLogin ? undefined : "Mínimo 8 caracteres."}><Input id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} {...form.register("password")} /></Field>
            {m.error && <ErrorBox error={m.error} />}
            <Button type="submit" className="w-full" loading={m.isPending}>{isLogin ? "Ingresar" : "Crear cuenta"}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {isLogin ? <>¿No tienes cuenta? <Link className="text-brand2 underline" href="/registro">Regístrate</Link></> : <>¿Ya tienes cuenta? <Link className="text-brand2 underline" href="/login">Ingresa</Link></>}
          </p>
          {!isLogin && <p className="mt-2 text-xs text-muted">Las cuentas nuevas son de donante. Los roles de coordinación los asigna un administrador.</p>}
        </CardContent>
      </Card>
      {isLogin && DEMO_PASSWORD && (
        <div className="mt-4">
          <Notice tone="violet">
            <b>Acceso rápido de demostración:</b> usuario <code className="rounded bg-black/10 px-1">demo</code>, contraseña <code className="rounded bg-black/10 px-1">{DEMO_PASSWORD}</code>.{" "}
            <button type="button" className="font-semibold underline" onClick={() => { form.setValue("email", "demo"); form.setValue("password", DEMO_PASSWORD); }}>Completar</button>
            <br />Otras cuentas (datos simulados), misma contraseña:
            <ul className="mt-2 space-y-1">
              {DEMO.map(([r, em]) => (
                <li key={em}><button type="button" className="text-left underline" onClick={() => { form.setValue("email", em); form.setValue("password", DEMO_PASSWORD); }}>{r}: {em}</button></li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
    </div>
  );
}
