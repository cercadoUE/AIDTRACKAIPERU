export const LEVELS = {
  critical: { label: "Crítica", color: "#e03131", cls: "bg-red-600 text-white" },
  high: { label: "Alta", color: "#f76707", cls: "bg-orange-500 text-white" },
  moderate: { label: "Moderada", color: "#f59f00", cls: "bg-yellow-400 text-black" },
  low: { label: "Baja", color: "#2f9e44", cls: "bg-green-600 text-white" },
  insufficient: { label: "Sin datos suficientes", color: "#868e96", cls: "bg-gray-400 text-white" },
} as const;
export type Level = keyof typeof LEVELS;

export const ROLE_LABEL: Record<string, string> = {
  donor: "Donante",
  shelter_coordinator: "Coordinador de albergue",
  logistics: "Coordinador logístico",
  admin: "Administrador",
};

export const STATUS_LABEL: Record<string, string> = {
  registered: "Registrada", validated: "Validada", assigned: "Asignada", approved: "Aprobada", prepared: "Preparada",
  dispatched: "Despachada", in_transit: "En transporte", delivered: "Entregada", received: "Recepción confirmada",
};
export const STATUS_ORDER = ["registered", "validated", "assigned", "approved", "prepared", "dispatched", "in_transit", "delivered", "received"];

export const SHELTER_STATUS: Record<string, string> = {
  pending: "Pendiente de verificación", active: "Activo", inactive: "Inactivo", historical: "Histórico", simulated: "Simulado",
};
export const NEED_STATUS: Record<string, string> = {
  draft: "Borrador", pending: "Pendiente", validated: "Validada", partial: "Parcialmente atendida", fulfilled: "Atendida", closed: "Cerrada",
};
export const URGENCY: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("es-PE"));
export const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
