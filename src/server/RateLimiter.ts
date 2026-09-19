/**
 * Per-caller limits: a burst window against a script hammering the button, a sustained one
 * against a slow drip, and a ceiling over all callers together so a crowd cannot run up the
 * model bill either. It counts in one process — a serverless deployment counts each instance
 * separately and starts over on a cold start — so it is a courtesy control. A hard limit
 * belongs in the platform's firewall, and a spend cap belongs at the model provider.
 */
type Window = { readonly limit: number; readonly ms: number };

const BURST: Window = { limit: 5, ms: 10_000 };
const SUSTAINED: Window = { limit: 20, ms: 60_000 };
const EVERYONE: Window = { limit: 60, ms: 60_000 };
/** Buckets, not callers: each caller holds two, so this is half as many people as it reads. */
const BUCKETS = 5_000;

type Bucket = { count: number; resetAt: number };
type Verdict = { readonly ok: true } | { readonly ok: false; readonly retryAfter: number };

const callers = new Map<string, Bucket>();
/** Outside the swept map: sweeping it away would disarm the ceiling under the very attack it is for. */
let crowd: Bucket | undefined;

const sweep = (now: number) => {
  if (callers.size < BUCKETS) return;
  for (const [key, bucket] of callers) if (now >= bucket.resetAt) callers.delete(key);
  if (callers.size >= BUCKETS) callers.clear();
};

const live = (bucket: Bucket | undefined, now: number): bucket is Bucket =>
  bucket !== undefined && now < bucket.resetAt;

const peek = (bucket: Bucket | undefined, window: Window, now: number): Verdict =>
  !live(bucket, now) || bucket.count < window.limit
    ? { ok: true }
    : { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };

const charge = (bucket: Bucket | undefined, window: Window, now: number): Bucket =>
  live(bucket, now) ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + window.ms };

/**
 * Every window is charged, but only once all three have agreed. Charging as we went let a
 * caller who was already being refused keep spending the shared ceiling, so one script could
 * lock out every other visitor for the rest of the minute.
 */
export const allow = (caller: string, now = Date.now()): Verdict => {
  const burst = callers.get(`${caller}:burst`);
  const sustained = callers.get(`${caller}:minute`);
  const refused = [
    peek(burst, BURST, now),
    peek(sustained, SUSTAINED, now),
    peek(crowd, EVERYONE, now),
  ].find((verdict) => !verdict.ok);
  if (refused !== undefined) return refused;

  sweep(now);
  callers.set(`${caller}:burst`, charge(burst, BURST, now));
  callers.set(`${caller}:minute`, charge(sustained, SUSTAINED, now));
  crowd = charge(crowd, EVERYONE, now);
  return { ok: true };
};

/**
 * Whatever the proxy in front of us wrote. On Vercel the edge overwrites both headers, so this
 * is the caller's real address; served directly, a caller can forge them and the limiter is
 * only as good as the deployment. With no proxy at all everyone shares the `local` bucket.
 */
export const callerOf = (headers: Headers) =>
  headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
