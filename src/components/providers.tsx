"use client";
import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { api } from "@/lib/api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "donor" | "shelter_coordinator" | "logistics" | "admin";
  shelterId?: string;
}

/* ---- Notificaciones ---- */
interface Toast { id: number; kind: "ok" | "error" | "info"; text: string }
const ToastCtx = React.createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[2000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm shadow-lg">
            {t.kind === "ok" ? <CheckCircle2 className="size-4 mt-0.5 text-accent shrink-0" /> : t.kind === "error" ? <XCircle className="size-4 mt-0.5 text-danger shrink-0" /> : <Info className="size-4 mt-0.5 text-brand2 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---- Sesión ---- */
export function useSession() {
  const q = useQuery({ queryKey: ["session"], queryFn: () => api<{ user: SessionUser | null }>("/api/auth/me"), staleTime: 30_000 });
  const qc = useQueryClient();
  return { user: q.data?.user ?? null, loading: q.isLoading, refresh: () => qc.invalidateQueries({ queryKey: ["session"] }) };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  React.useEffect(() => {
    if (localStorage.getItem("aidtrack-theme") === "dark") document.documentElement.classList.add("dark");
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
