import { z } from "zod";
import { CATEGORIES, PRODUCT_BY_KEY } from "../domain/catalog";

export const parsedItem = z.object({
  category: z.string().refine((c) => c in CATEGORIES),
  product: z.string().refine((p) => PRODUCT_BY_KEY.has(p)),
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().min(1).max(30),
  /** true si la cantidad/unidad es ambigua y exige confirmación explícita. */
  needsConfirmation: z.boolean(),
  note: z.string().max(200).optional(),
});

export const parsedDonation = z.object({
  donations: z.array(parsedItem).max(30),
  location: z.string().max(120).nullable(),
  unrecognized: z.array(z.string().max(120)).max(20).default([]),
});
export type ParsedDonation = z.infer<typeof parsedDonation> & { source: "rules" | "bedrock"; departmentCode?: string | null; warnings: string[] };

export const parsedNeeds = z.object({
  occupants: z.number().int().min(0).max(100_000).nullable(),
  autonomyDays: z.number().min(0).max(60).nullable(),
  needs: z.array(
    parsedItem.extend({
      urgency: z.enum(["critical", "high", "medium", "low"]).default("medium"),
    }),
  ).max(30),
  observations: z.string().max(500).nullable(),
});
export type ParsedNeeds = z.infer<typeof parsedNeeds> & { source: "rules" | "bedrock"; warnings: string[] };
