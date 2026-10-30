import { tooMany } from "./errors";

const buckets = new Map<string, { count: number; reset: number }>();

/** Limitador de ventana fija en memoria. En AWS se complementa con WAF/API Gateway. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
  } else {
    b.count += 1;
    if (b.count > limit) throw tooMany();
  }
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}
