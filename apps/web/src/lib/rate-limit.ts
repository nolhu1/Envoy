import "server-only";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitPolicy = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, RateLimitBucket>();

function now() {
  return Date.now();
}

export function getClientIpFromHeaders(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export function checkRateLimit(policy: RateLimitPolicy) {
  const current = now();
  const existing = buckets.get(policy.key);

  if (!existing || existing.resetAt <= current) {
    const bucket = {
      count: 1,
      resetAt: current + policy.windowMs,
    };
    buckets.set(policy.key, bucket);
    return {
      allowed: true,
      remaining: Math.max(0, policy.limit - 1),
      resetAt: bucket.resetAt,
    };
  }

  if (existing.count >= policy.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, policy.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

export function assertRateLimit(policy: RateLimitPolicy) {
  const result = checkRateLimit(policy);

  if (!result.allowed) {
    const error = new Error("Too many requests. Try again later.");
    error.name = "RateLimitError";
    throw error;
  }

  return result;
}

export function createRateLimitResponse(result: {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "rate_limited",
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(
          Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
        ),
        "x-ratelimit-remaining": String(result.remaining),
      },
    },
  );
}
