"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { withBase } from "@/lib/base-path";
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
  // Lectura tras el montaje (no en el render) para mantener la hidratación estable.
  const [nextParam, setNextParam] = React.useState("/donar");
  const [formError, setFormError] = React.useState(false);
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee la URL una sola vez
    setNextParam(q.get("next") ?? "/donar");
    setFormError(q.get("error") === "1");
  }, []);
  const form = useForm<{ name?: string; email: string; password: string }>({ resolver: zodResolver(isLogin ? loginSchema : registerSchema) as never });
  const m = useMutation({
    mutationFn: (v: { name?: string; email: string; password: string }) => api(`/api/auth/${mode}`, { method: "POST", json: v }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      const next = new URLSearchParams(window.location.search).get("next");
      // Solo rutas internas: evita redirecciones abiertas a otros dominios.
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/donar");
      router.refresh();
    },
  });
  const e = form.formState.errors;
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader><CardTitle className="text-xl">{isLogin ? "Ingresar" : "Crear cuenta de donante"}</CardTitle></CardHeader>
        <CardContent>
          <form action={isLogin ? withBase("/api/auth/login") : undefined} method="post" onSubmit={form.handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
            {isLogin && <input type="hidden" name="next" value={nextParam} />}
            {isLogin && formError && !m.error && <ErrorBox error="Usuario o contraseña incorrectos. Revisa los datos e intenta de nuevo." />}
            {!isLogin && <Field label="Nombre" htmlFor="name" error={e.name?.message}><Input id="name" autoComplete="name" {...form.register("name")} /></Field>}
            <Field label={isLogin ? "Usuario o correo" : "Correo"} htmlFor="email" error={e.email?.message}><Input id="email" type={isLogin ? "text" : "email"} autoComplete={isLogin ? "username" : "email"} {...form.register("email")} name="email" /></Field>
            <Field label="Contraseña" htmlFor="password" error={e.password?.message} hint={isLogin ? undefined : "Mínimo 8 caracteres."}><Input id="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} {...form.register("password")} name="password" /></Field>
            {m.error && <ErrorBox error={m.error.message.startsWith("Correo o contraseña") ? "Usuario o contraseña incorrectos. Revisa los datos e intenta de nuevo." : m.error} />}
            <Button type="submit" className="w-full" loading={m.isPending}>{m.isPending ? (isLogin ? "Entrando…" : "Creando cuenta…") : isLogin ? "Entrar" : "Crear cuenta"}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            {isLogin ? <>¿No tienes cuenta? <Link prefetch={false} className="text-brand2 underline" href="/registro">Regístrate</Link></> : <>¿Ya tienes cuenta? <Link prefetch={false} className="text-brand2 underline" href="/login">Ingresa</Link></>}
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
