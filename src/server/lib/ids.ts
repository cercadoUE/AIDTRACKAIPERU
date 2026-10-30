import { randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
export const nowIso = () => new Date().toISOString();
export const folio = (prefix: string, n: number, year = new Date().getFullYear()) => `${prefix}-${year}-${String(n).padStart(6, "0")}`;

export function randomCode6(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
