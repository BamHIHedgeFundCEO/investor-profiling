// Best-effort rate limit: per-instance memory only. On serverless this is not a
// strict guarantee (each instance counts separately); production would use a
// centralized counter such as Upstash Redis. Documented in the README.

const HITS = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  { limit = 5, windowMs = 60_000, now = Date.now() } = {},
): RateLimitResult {
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    HITS.set(key, recent);
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - recent[0]!)) / 1000) };
  }
  recent.push(now);
  HITS.set(key, recent);
  // Keep the map from growing without bound on a long-lived instance.
  if (HITS.size > 5000) for (const [k, v] of HITS) if (v.every((t) => now - t >= windowMs)) HITS.delete(k);
  return { allowed: true, remaining: limit - recent.length, retryAfterSec: 0 };
}

export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(',')[0] ?? 'unknown').trim();
}

export function resetRateLimit() {
  HITS.clear();
}
