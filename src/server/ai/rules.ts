import { PRODUCTS, UNIT_ALIASES, findDepartment, stripAccents, type ProductDef } from "../domain/catalog";
import { VAGUE, isNumberWord, wordsToNumber } from "./numbers";
import type { ParsedDonation, ParsedNeeds } from "./types";

interface Hit {
  product: ProductDef;
  start: number;
  end: number;
  quantity: number | null;
  unit: string | null;
  vague: boolean;
}

function norm(text: string): string {
  return stripAccents(text.toLowerCase()).replace(/[,;]/g, " , ").replace(/\s+/g, " ");
}

const ALIASES = PRODUCTS.flatMap((p) => p.aliases.map((a) => ({ alias: stripAccents(a.toLowerCase()), product: p }))).sort((a, b) => b.alias.length - a.alias.length);

/** Busca productos y la cantidad/unidad que los precede inmediatamente. */
function findHits(text: string): Hit[] {
  const t = norm(text);
  const taken: [number, number][] = [];
  const hits: Hit[] = [];
  for (const { alias, product } of ALIASES) {
    const re = new RegExp(`(^|[^a-z])(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![a-z])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const start = m.index + m[1].length;
      const end = start + alias.length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      const q = quantityBefore(t, start);
      // Alias de recipiente ("botellas de agua"): la unidad real es el recipiente, no litros.
      const container = /^(botella|bidon)/.exec(alias);
      if (container && !q.unit) q.unit = container[1] === "botella" ? "botellas" : "bidones";
      hits.push({ product, start, end, ...q });
    }
  }
  // Una cantidad no puede asignarse a dos productos: se conserva solo para el más cercano.
  return hits.sort((a, b) => a.start - b.start);
}

function quantityBefore(t: string, start: number): { quantity: number | null; unit: string | null; vague: boolean } {
  const before = t.slice(0, start).trimEnd();
  // Retrocede hasta una coma o "y"+coma que separe elementos.
  const segment = before.split(/\s,\s|\sy\s(?=\d)/).pop() ?? before;
  const tokens = segment.split(" ").filter(Boolean);
  // Quita preposiciones finales: "de", "del", "en".
  while (tokens.length && ["de", "del", "en", "con"].includes(tokens[tokens.length - 1])) tokens.pop();
  let unit: string | null = null;
  const last = tokens[tokens.length - 1];
  if (last && last in UNIT_ALIASES) {
    unit = UNIT_ALIASES[last];
    tokens.pop();
    while (tokens.length && ["de", "del"].includes(tokens[tokens.length - 1])) tokens.pop();
  } else if (last && /^\d+(\.\d+)?(kg|kgs|l|lt|lts)$/.test(last)) {
    const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(last)!;
    return { quantity: Number(m[1]), unit: UNIT_ALIASES[m[2]] ?? null, vague: false };
  }
  // Cantidad numérica
  const lastTok = tokens[tokens.length - 1];
  if (lastTok && /^\d+([.,]\d+)?$/.test(lastTok)) {
    return { quantity: Number(lastTok.replace(",", ".")), unit, vague: false };
  }
  // Cantidad en palabras
  const words: string[] = [];
  for (let i = tokens.length - 1; i >= 0 && isNumberWord(tokens[i]); i--) words.unshift(tokens[i]);
  const n = wordsToNumber(words);
  if (n !== null) return { quantity: n, unit, vague: false };
  const vague = !!lastTok && VAGUE.has(lastTok);
  return { quantity: null, unit, vague };
}

function resolveUnit(hit: Hit): { unit: string; mismatch: boolean } {
  const canonical = hit.product.unit;
  if (!hit.unit) return { unit: canonical, mismatch: false };
  if (hit.unit === canonical) return { unit: canonical, mismatch: false };
  return { unit: hit.unit, mismatch: true };
}

export function parseDonationRules(text: string): ParsedDonation {
  const hits = findHits(text);
  const warnings: string[] = [];
  const donations = hits.map((h) => {
    const { unit, mismatch } = resolveUnit(h);
    let note: string | undefined;
    let needsConfirmation = false;
    if (h.quantity === null) {
      needsConfirmation = true;
      note = h.vague ? "Cantidad vaga: indica un número exacto." : "No se indicó cantidad.";
    }
    if (mismatch) {
      needsConfirmation = true;
      note = `Indicaste "${unit}" pero este producto se registra en ${h.product.unit}. Confirma la equivalencia.`;
    }
    if (h.quantity !== null && h.quantity !== Math.floor(h.quantity) && h.product.unit !== "kg" && h.product.unit !== "litros") {
      needsConfirmation = true;
      note = "Cantidad fraccionaria para un producto contable.";
    }
    return {
      category: h.product.category,
      product: h.product.key,
      quantity: h.quantity,
      unit,
      needsConfirmation,
      note,
    };
  });
  if (!donations.length) warnings.push("No se reconoció ningún producto. Prueba con el formulario.");
  const dept = findDepartment(text);
  const loc = /\b(?:estoy en|desde|ubicado en|vivo en|en)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,40})/i.exec(text.replace(/[.,;].*$/, (s) => s));
  const location = dept?.name ?? (loc ? loc[1].trim() : null);
  return { donations, location, unrecognized: [], source: "rules", departmentCode: dept?.code ?? null, warnings };
}

export function parseNeedsRules(text: string): ParsedNeeds {
  const t = norm(text);
  const warnings: string[] = [];
  let occupants: number | null = null;
  const occ = /(\d+|[a-z ]+?)\s+(?:personas|damnificados|familias|ocupantes)/.exec(t);
  if (occ) {
    occupants = /^\d+$/.test(occ[1]) ? Number(occ[1]) : wordsToNumber(occ[1].trim().split(" ").filter((w) => isNumberWord(w)));
    if (/familias/.test(occ[0])) {
      warnings.push("Se mencionan familias, no personas; confirma el número de personas.");
      occupants = null;
    }
  }
  let autonomyDays: number | null = null;
  const aut = /(?:para|durante)\s+(\d+|un|una|dos|tres|cuatro|cinco|siete)\s+(dia|dias|semana|semanas)/.exec(t);
  if (aut) {
    const n = /^\d+$/.test(aut[1]) ? Number(aut[1]) : wordsToNumber([aut[1]]);
    if (n !== null) autonomyDays = aut[2].startsWith("semana") ? n * 7 : n;
  }
  const hits = findHits(text);
  const lowStock = /(?:solo|solamente|apenas)\s+(?:contamos|tenemos|queda)/.test(t);
  const needs = hits.map((h) => {
    const { unit, mismatch } = resolveUnit(h);
    const segmentStart = Math.max(0, h.start - 60);
    const ctx = t.slice(segmentStart, h.end + 30);
    const asks = /necesit|falta|requer|urgen|solicit/.test(ctx);
    const hasStockOnly = /(contamos|tenemos|queda)/.test(ctx) && !asks;
    const quantity = hasStockOnly ? null : h.quantity;
    let note: string | undefined;
    if (hasStockOnly) note = "Se mencionó como existencia disponible, no como cantidad solicitada; indica cuánto necesitas.";
    else if (quantity === null) note = "No se indicó cantidad.";
    if (mismatch) note = `Unidad "${unit}" distinta de ${h.product.unit}; confirma.`;
    return {
      category: h.product.category,
      product: h.product.key,
      quantity,
      unit: mismatch ? unit : h.product.unit,
      needsConfirmation: quantity === null || mismatch,
      note,
      urgency: (/urgen|critic|ya|inmediat/.test(ctx) || (lowStock && h.product.essential) ? "high" : "medium") as "high" | "medium",
    };
  });
  if (!needs.length) warnings.push("No se reconoció ninguna necesidad. Usa el formulario manual.");
  return { occupants, autonomyDays, needs, observations: null, source: "rules", warnings };
}
