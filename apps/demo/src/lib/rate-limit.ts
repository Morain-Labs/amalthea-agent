/**
 * Per-IP token bucket, in memory. Demo-grade endpoint protection for a
 * public Cloud Run URL: judges can use the demo freely, a scraper or a loop
 * cannot drain the model budget. Each instance keeps its own buckets, and
 * the instance count is capped at deploy time, so the worst case stays
 * bounded.
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED = 10_000;

export interface RateLimitRule {
  /** Sustained requests per minute. */
  perMinute: number;
  /** Extra burst headroom on top of the sustained rate. */
  burst: number;
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const capacity = rule.burst + rule.perMinute;
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED) buckets.clear();
    bucket = { tokens: capacity, lastRefill: now };
    buckets.set(key, bucket);
  }
  const refill = ((now - bucket.lastRefill) / 60_000) * rule.perMinute;
  bucket.tokens = Math.min(capacity, bucket.tokens + refill);
  bucket.lastRefill = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const deficit = 1 - bucket.tokens;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((deficit / rule.perMinute) * 60)),
  };
}

/** Client IP as Cloud Run reports it (first x-forwarded-for hop), else a shared bucket. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export function tooMany(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Too many requests. Give it a moment and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}
