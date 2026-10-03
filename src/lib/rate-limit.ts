/**
 * Best-effort abuse control for anonymous writes.
 *
 * There are no accounts, so the only identity available is the session scope.
 * On serverless this map dies with the instance, which means it is a *floor*,
 * not a guarantee: a determined attacker can spread requests across instances.
 * Real rate limiting belongs at the edge (Vercel WAF, Cloudflare, Upstash), and
 * the README says so. What this does buy is protection against accidental
 * double-submits and runaway importers on a single instance.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const globalBuckets = globalThis as unknown as { __ct_rate__?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  if (!globalBuckets.__ct_rate__) globalBuckets.__ct_rate__ = new Map();
  return globalBuckets.__ct_rate__;
}

export interface RateVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function takeQuota(key: string, limit: number): RateVerdict {
  const now = Date.now();
  const map = buckets();
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (map.size > 5000) {
      for (const [bucketKey, bucket] of map) if (bucket.resetAt <= now) map.delete(bucketKey);
    }
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, limit };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      limit,
    };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
    limit,
  };
}

/** Generous enough that a real survey is never blocked, tight enough to stop a loop. */
export const WRITE_LIMIT_PER_MINUTE = 60;
export const IMPORT_LIMIT_PER_MINUTE = 12;
export const MCP_LIMIT_PER_MINUTE = 90;