const WINDOW_MS = 60_000;
const LIMIT = 20;
const CAPACITY = 5_000;

const seen = new Map<string, { count: number; resetAt: number }>();

/**
 * A courtesy control, not a security boundary: it lives in one process, so a serverless
 * deployment resets it on every cold start and counts each instance separately. The map is
 * capped and swept so it cannot grow without bound.
 */
export const allow = (key: string, now = Date.now()) => {
  const entry = seen.get(key);
  if (entry === undefined || now >= entry.resetAt) {
    if (seen.size >= CAPACITY) {
      for (const [k, v] of seen) if (now >= v.resetAt) seen.delete(k);
      if (seen.size >= CAPACITY) seen.clear();
    }
    seen.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true as const };
  }
  if (entry.count >= LIMIT) return { ok: false as const, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  entry.count += 1;
  return { ok: true as const };
};

export const reset = () => seen.clear();
