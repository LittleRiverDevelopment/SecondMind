type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(key: string, limit: number, windowMs = 60 * 60 * 1000, now = Date.now()) {
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < windowMs);
  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return { ok: false as const, retryAfterMs: windowMs - (now - bucket.timestamps[0]!) };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true as const };
}

export function resetRateLimits() {
  buckets.clear();
}
