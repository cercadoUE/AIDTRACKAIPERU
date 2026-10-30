import { stripAccents } from "../domain/catalog";

const UNITS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

export const VAGUE = new Set(["unos", "unas", "algunos", "algunas", "varios", "varias", "bastante", "bastantes", "muchos", "muchas", "poco", "pocos", "pocas"]);

/** Convierte una secuencia de palabras numéricas en español a un número. Devuelve null si no es número. */
export function wordsToNumber(words: string[]): number | null {
  if (!words.length) return null;
  let total = 0;
  let current = 0;
  let any = false;
  for (const raw of words) {
    const w = stripAccents(raw.toLowerCase());
    if (w === "y") continue;
    if (w in HUNDREDS) { current += HUNDREDS[w]; any = true; }
    else if (w in TENS) { current += TENS[w]; any = true; }
    else if (w in UNITS) { current += UNITS[w]; any = true; }
    else if (w === "mil") { total += (current || 1) * 1000; current = 0; any = true; }
    else if (w === "docena" || w === "docenas") { current = (current || 1) * 12; any = true; }
    else if (w === "medio" || w === "media") { current += 0.5; any = true; }
    else return null;
  }
  return any ? total + current : null;
}

const NUMBER_WORD = new RegExp(`^(${[...Object.keys(UNITS), ...Object.keys(TENS), ...Object.keys(HUNDREDS), "mil", "y", "docena", "docenas", "medio", "media"].join("|")})$`);

export function isNumberWord(w: string): boolean {
  return NUMBER_WORD.test(stripAccents(w.toLowerCase()));
}
