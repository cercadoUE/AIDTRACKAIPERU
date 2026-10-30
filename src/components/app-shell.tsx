"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutDashboard, Map as MapIcon, Trophy, Home, ClipboardList, Package, Truck, FlaskConical, ShieldCheck, Menu, X, Moon, Sun, LogIn, LogOut, UserPlus, Building2, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "./providers";
import { Button } from "./ui";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/donar", label: "Quiero donar", icon: Heart, highlight: true },
  { href: "/donaciones", label: "Donaciones", icon: Package },
  { href: "/mapa", label: "Mapa nacional", icon: MapIcon },
  { href: "/ranking", label: "Ranking", icon: Trophy },
  { href: "/albergues", label: "Albergues", icon: Building2 },
  { href: "/necesidades", label: "Necesidades", icon: ClipboardList },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/distribucion", label: "Distribución", icon: Truck },
  { href: "/distribucion/simulador", label: "Simulador", icon: FlaskConical },
  { href: "/admin", label: "Administración", icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useSession();
  // El menú móvil se considera abierto solo en la ruta donde se abrió: al navegar se cierra sin efectos.
  const [openAt, setOpenAt] = React.useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("aidtrack-theme", next ? "dark" : "light");
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    await qc.invalidateQueries();
    router.push("/");
  };

  const active = (href: string) => (href === "/" ? path === "/" : href === "/distribucion" ? path === "/distribucion" : path.startsWith(href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:z-[3000] focus:bg-white focus:p-2 focus:text-black">Saltar al contenido</a>
      <aside className={cn("fixed inset-y-0 left-0 z-[1500] w-64 -translate-x-full overflow-y-auto bg-sidebar p-4 text-white transition-transform lg:static lg:w-auto lg:translate-x-0", open && "translate-x-0")} aria-label="Navegación principal">
        <Link prefetch={false} href="/" className="mb-6 flex items-center gap-2.5 px-1">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand2 to-accent shadow-lg"><Radar className="size-5" aria-hidden /></span>
          <span className="leading-tight"><span className="block text-lg font-extrabold tracking-tight">AIDTRACK</span><span className="block text-[11px] tracking-[0.2em] text-sky-200">AI PERÚ</span></span>
        </Link>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon, highlight }) => (
            <Link prefetch={false} key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition", active(href) ? "bg-white/15 font-semibold" : "text-sky-100/80 hover:bg-white/10", highlight && !active(href) && "bg-accent/90 font-semibold text-white hover:bg-accent")}>
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <p className="mt-6 rounded-lg bg-white/5 p-3 text-xs leading-relaxed text-sky-100/70">
          Los datos con la etiqueta <b className="text-violet-300">SIMULADO</b> son de demostración. Los índices de necesidad son experimentales y no oficiales.
        </p>
      </aside>
      {open && <button aria-label="Cerrar menú" className="fixed inset-0 z-[1400] bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-[1000] flex items-center gap-2 border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur">
          <Button variant="ghost" size="sm" className="lg:hidden" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen(!open)}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggle} aria-label="Cambiar modo claro u oscuro"><Moon className="size-4 dark:hidden" /><Sun className="hidden size-4 dark:block" /></Button>
            {user ? (
              <>
                <div className="hidden text-right text-xs leading-tight sm:block"><div className="font-semibold">{user.name}</div><div className="text-muted">{ROLE_LABEL[user.role]}</div></div>
                <Button variant="outline" size="sm" onClick={logout}><LogOut className="size-4" /> Salir</Button>
              </>
            ) : path === "/login" || path === "/registro" ? null : (
              <>
                <Link prefetch={false} href={`/login?next=${encodeURIComponent(path)}`}><Button variant="outline" size="sm"><LogIn className="size-4" /> Ingresar</Button></Link>
                <Link prefetch={false} href="/registro" className="hidden sm:block"><Button size="sm"><UserPlus className="size-4" /> Crear cuenta</Button></Link>
              </>
            )}
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
        <footer className="border-t border-border px-6 py-4 text-xs text-muted">
          AIDTRACK AI PERÚ · Fuentes: INDECI/SINPAD y INEI (datosabiertos.gob.pe). Los datos de demostración son ficticios. Las recomendaciones requieren aprobación humana.
        </footer>
      </div>
    </div>
  );
}
