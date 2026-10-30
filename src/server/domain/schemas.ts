import { z } from "zod";
import { CATEGORIES, PRODUCT_BY_KEY } from "./catalog";

export const categoryKey = z.string().refine((c) => c in CATEGORIES, "Categoría desconocida");
export const productKey = z.string().refine((p) => PRODUCT_BY_KEY.has(p), "Producto desconocido");

export const quantity = z.number({ message: "La cantidad debe ser un número" }).finite().positive("La cantidad debe ser mayor que 0").max(1_000_000, "Cantidad demasiado grande");

export const donationItemInput = z.object({
  category: categoryKey,
  product: productKey,
  quantity,
  unit: z.string().min(1).max(30),
  condition: z.enum(["nuevo", "usado_buen_estado"]).optional(),
  expiresAt: z.string().date().optional(),
});

export const donationInput = z.object({
  channel: z.enum(["text", "voice", "form"]),
  originalText: z.string().max(2000).optional(),
  locationText: z.string().max(120).optional(),
  departmentCode: z.string().regex(/^\d{2}$/).optional(),
  lat: z.number().min(-19).max(0.5).optional(),
  lng: z.number().min(-82).max(-68).optional(),
  transportAvailable: z.boolean().default(false),
  items: z.array(donationItemInput).min(1, "Agrega al menos un producto").max(30),
  /** El usuario debe confirmar explícitamente los datos antes de registrar. */
  confirmed: z.literal(true, { message: "Debes confirmar los datos antes de registrar la donación" }),
});
export type DonationInput = z.infer<typeof donationInput>;

export const shelterInput = z.object({
  name: z.string().min(3).max(120),
  departmentCode: z.string().regex(/^\d{2}$/),
  province: z.string().min(2).max(80),
  district: z.string().min(2).max(80),
  ubigeo: z.string().regex(/^\d{6}$/, "UBIGEO de 6 dígitos"),
  address: z.string().min(3).max(200),
  lat: z.number().min(-19).max(0.5),
  lng: z.number().min(-82).max(-68),
  capacity: z.number().int().min(1).max(100_000),
  occupants: z.number().int().min(0).max(100_000),
  families: z.number().int().min(0).max(50_000),
  type: z.string().min(2).max(60),
  contactName: z.string().max(80).optional(),
  contactPhone: z.string().max(30).optional(),
  vulnerableShare: z.number().min(0).max(1).optional(),
  accessDifficulty: z.number().min(0).max(1).optional(),
});
export type ShelterInput = z.infer<typeof shelterInput>;

export const shelterPatch = shelterInput.partial();

export const inventoryInput = z.object({ product: productKey, quantity: z.number().min(0).max(10_000_000), unit: z.string().min(1).max(30) });

export const needInput = z.object({
  category: categoryKey,
  product: productKey,
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().min(1).max(30),
  urgency: z.enum(["critical", "high", "medium", "low"]),
  notes: z.string().max(500).optional(),
});
export type NeedInput = z.infer<typeof needInput>;

export const needsSubmission = z.object({
  needs: z.array(needInput).min(1).max(30),
  occupants: z.number().int().min(0).max(100_000).optional(),
  autonomyDaysDeclared: z.number().min(0).max(60).optional(),
  originalText: z.string().max(2000).optional(),
  confirmed: z.literal(true, { message: "Debes aprobar los datos antes de guardarlos" }),
});

export const registerInput = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  password: z.string().min(8, "Mínimo 8 caracteres").max(100),
});
/** `email` acepta un correo o un nombre de usuario. */
export const loginInput = z.object({ email: z.string().trim().min(1).max(120), password: z.string().min(1).max(100) });

export const confirmReceiptInput = z.object({ code: z.string().regex(/^\d{6}$/, "Código de 6 dígitos"), notes: z.string().max(300).optional() });
