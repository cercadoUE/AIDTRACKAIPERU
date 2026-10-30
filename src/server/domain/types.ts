export type Role = "donor" | "shelter_coordinator" | "logistics" | "admin";

export interface Provenance {
  source_type: "official" | "simulated" | "user" | "import";
  source_name: string;
  source_url?: string;
  imported_at: string;
  last_verified_at?: string | null;
  is_simulated: boolean;
}

export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface User extends Base {
  email: string;
  /** Usuario de acceso sin correo (cuentas de demostración). */
  username?: string;
  name: string;
  role: Role;
  passwordHash: string;
  shelterId?: string; // coordinador de albergue
}

export type ShelterStatus = "pending" | "active" | "inactive" | "historical" | "simulated";

export interface Shelter extends Base, Provenance {
  name: string;
  departmentCode: string;
  department: string;
  province: string;
  district: string;
  ubigeo: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
  occupants: number;
  families: number;
  type: string;
  status: ShelterStatus;
  verified: boolean;
  /** Dato personal: solo visible para roles autorizados. */
  contact?: { name: string; phone: string };
  vulnerableShare?: number; // 0..1, solo si existe información legítima
  accessDifficulty?: number; // 0..1
  coordinatorId?: string;
  dataUpdatedAt: string;
}

export interface InventoryItem extends Base {
  shelterId: string;
  product: string;
  quantity: number;
  unit: string;
}

export type Urgency = "critical" | "high" | "medium" | "low";
export type NeedStatus = "draft" | "pending" | "validated" | "partial" | "fulfilled" | "closed";

export interface ShelterNeed extends Base, Provenance {
  shelterId: string;
  category: string;
  product: string;
  quantity: number | null; // null = pendiente de confirmación
  fulfilled: number;
  reserved: number;
  unit: string;
  urgency: Urgency;
  status: NeedStatus;
  notes?: string;
}

export type DonationStatus =
  | "registered"
  | "validated"
  | "assigned"
  | "approved"
  | "prepared"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "received";

export interface Donation extends Base, Provenance {
  folio: string; // DON-2026-000001
  donorId: string;
  status: DonationStatus;
  channel: "text" | "voice" | "form";
  originalText?: string;
  locationText?: string;
  departmentCode?: string;
  lat?: number;
  lng?: number;
  transportAvailable: boolean;
  medicine: boolean;
}

export interface DonationItem extends Base {
  donationId: string;
  category: string;
  product: string;
  quantity: number;
  reserved: number;
  unit: string;
  condition?: string;
  expiresAt?: string;
}

export type AllocationStatus = "proposed" | "approved" | "rejected" | "cancelled";

export interface DonationAllocation extends Base {
  donationId: string;
  itemId: string;
  shelterId: string;
  needId: string;
  product: string;
  quantity: number;
  unit: string;
  status: AllocationStatus;
  distanceKm: number;
  coverage: number; // 0..1 cobertura esperada
  explanation: string;
  optimizationRunId: string;
  approvedBy?: string;
}

export interface DistributionCenter extends Base, Provenance {
  name: string;
  department: string;
  lat: number;
  lng: number;
  kind: "centro" | "almacen";
}

export type ShipmentStatus =
  | "approved"
  | "prepared"
  | "dispatched"
  | "in_transit"
  | "delivered"
  | "received";

export interface Shipment extends Base {
  code: string; // ENV-2026-000001
  donationId: string;
  shelterId: string;
  allocationIds: string[];
  status: ShipmentStatus;
  confirmationCodeHash: string; // "sal:sha256(sal:codigo)"; nunca se devuelve por API
  qrToken: string;
  confirmedCount: number; // 0 | 1, marca atómica contra doble confirmación
  receivedAt?: string;
  receivedBy?: string;
}

export interface ShipmentEvent extends Base {
  shipmentId: string;
  at: string;
  action: string;
  actorId: string;
  actorRole: Role | "system";
  from: string | null;
  to: string;
  quantities?: Record<string, number>;
  notes?: string;
}

export interface Emergency extends Base, Provenance {
  name: string;
  hazard: string;
  departmentCode: string;
  description: string;
  severity: number;
}

export interface GeographicLocation extends Base {
  source: string;
  ubigeo: string;
  departmentCode: string;
  department: string;
  provinceCode: string;
  province: string;
  district: string;
}

export interface PriorityScoreRecord extends Base {
  shelterId: string;
  score: number | null;
  level: PriorityLevel;
  confidence: "alta" | "media" | "baja";
  factors: Record<string, number | null>;
  mainNeed?: string;
  autonomyDays: number | null;
  explanation: string;
  computedAt: string;
}

export type PriorityLevel = "critical" | "high" | "moderate" | "low" | "insufficient";

export interface OptimizationRun extends Base {
  donationId: string;
  method: "milp" | "greedy";
  objective: number;
  uncoveredBefore: number;
  uncoveredAfter: number;
  durationMs: number;
  simulated: boolean;
}

export interface AuditLog extends Base {
  at: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: unknown;
}

export interface DataSource extends Base {
  name: string;
  url: string;
  kind: "sinpad" | "ubigeo" | "simulated";
  rows: number;
  accepted: number;
  rejected: number;
  report?: unknown;
}

export interface EmergencyStat extends Base {
  departmentCode: string;
  department: string;
  year: number;
  hazard: string;
  events: number;
  deceased: number;
  homeless: number; // damnificados históricos (NO es ocupación actual)
  affected: number;
}

export interface Counter extends Base {
  value: number;
}

export interface SettingsRecord extends Base {
  weights: { deficit: number; autonomy: number; severity: number; vulnerability: number; logistics: number };
  targetDays: number;
}

export interface Tables {
  users: User;
  shelters: Shelter;
  inventory: InventoryItem;
  needs: ShelterNeed;
  donations: Donation;
  donationItems: DonationItem;
  allocations: DonationAllocation;
  centers: DistributionCenter;
  shipments: Shipment;
  shipmentEvents: ShipmentEvent;
  emergencies: Emergency;
  locations: GeographicLocation;
  priorities: PriorityScoreRecord;
  optimizationRuns: OptimizationRun;
  audit: AuditLog;
  dataSources: DataSource;
  emergencyStats: EmergencyStat;
  counters: Counter;
  settings: SettingsRecord;
  shelterHistory: Base & { shelterId: string; actorId: string; changes: Record<string, unknown> };
}

export type TableName = keyof Tables;
