"use client";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-brand2 text-white hover:bg-brand2/90 shadow-sm",
        accent: "bg-accent text-white hover:bg-accent/90 shadow-sm",
        danger: "bg-danger text-white hover:bg-danger/90",
        outline: "border border-border bg-card hover:bg-black/5 dark:hover:bg-white/10",
        ghost: "hover:bg-black/5 dark:hover:bg-white/10",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...p}>
    {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = "Button";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-2xl border border-border bg-card shadow-sm", className)} {...p} />
);
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-1 p-5 pb-2", className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn("text-base font-semibold", className)} {...p} />;
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5 pt-2", className)} {...p} />;

export function Badge({ className, tone = "gray", ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "gray" | "blue" | "green" | "orange" | "red" | "yellow" | "violet" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
    green: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200",
    red: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
    yellow: "bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-100",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)} {...p} />;
}

/** Marca visible de dato simulado. Debe usarse junto a cualquier registro de demostración. */
export const SimBadge = () => (
  <Badge tone="violet" title="Dato de demostración: no es información real">
    SIMULADO
  </Badge>
);

const field = "w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-brand2 disabled:opacity-60";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, "h-10", className)} {...p} />);
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, "py-2 min-h-24", className)} {...p} />);
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={cn(field, "h-10", className)} {...p} />);
Select.displayName = "Select";

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export const Spinner = ({ label = "Cargando…" }: { label?: string }) => (
  <div role="status" className="flex items-center gap-2 py-8 justify-center text-muted text-sm">
    <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded-lg bg-black/10 dark:bg-white/10", className)} />;

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "orange" | "violet" | "green"; children: React.ReactNode }) {
  const t = { blue: "border-brand2/40 bg-brand2/10", orange: "border-warn/50 bg-warn/10", violet: "border-violet-400/50 bg-violet-500/10", green: "border-accent/50 bg-accent/10" }[tone];
  return <div className={cn("rounded-lg border p-3 text-sm", t)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cn("bg-black/5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted dark:bg-white/5", className)} {...p} />;
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("border-t border-border px-3 py-2.5 align-top", className)} {...p} />;
