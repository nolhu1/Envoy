export const WORKER_BACKOFF_STRATEGIES = {
  FIXED: "fixed",
  EXPONENTIAL: "exponential",
} as const;

export type WorkerBackoffStrategy =
  (typeof WORKER_BACKOFF_STRATEGIES)[keyof typeof WORKER_BACKOFF_STRATEGIES];

export type WorkerBackoffPolicy = {
  strategy: WorkerBackoffStrategy;
  delayMs: number;
  maxDelayMs?: number | null;
};

export type WorkerRetryPolicy = {
  maxAttempts: number;
  backoff: WorkerBackoffPolicy;
};

export type WorkerRetryPolicyInput = Partial<
  Omit<WorkerRetryPolicy, "backoff">
> & {
  backoff?: Partial<WorkerBackoffPolicy> | null;
};

const WORKER_DEFAULT_MAX_ATTEMPTS_ENV = "WORKER_DEFAULT_MAX_ATTEMPTS";
const WORKER_DEFAULT_BACKOFF_STRATEGY_ENV = "WORKER_DEFAULT_BACKOFF_STRATEGY";
const WORKER_DEFAULT_BACKOFF_DELAY_MS_ENV = "WORKER_DEFAULT_BACKOFF_DELAY_MS";
const WORKER_DEFAULT_BACKOFF_MAX_DELAY_MS_ENV =
  "WORKER_DEFAULT_BACKOFF_MAX_DELAY_MS";

function toPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.trunc(numeric);
}

function readDefaultBackoffStrategy() {
  const strategy = process.env[WORKER_DEFAULT_BACKOFF_STRATEGY_ENV];

  if (strategy === WORKER_BACKOFF_STRATEGIES.FIXED) {
    return WORKER_BACKOFF_STRATEGIES.FIXED;
  }

  if (strategy === WORKER_BACKOFF_STRATEGIES.EXPONENTIAL) {
    return WORKER_BACKOFF_STRATEGIES.EXPONENTIAL;
  }

  return WORKER_BACKOFF_STRATEGIES.EXPONENTIAL;
}

function resolveDefaultWorkerRetryPolicy(): WorkerRetryPolicy {
  const delayMs = toPositiveInt(
    process.env[WORKER_DEFAULT_BACKOFF_DELAY_MS_ENV],
    1_000,
  );
  const maxDelayMs = toPositiveInt(
    process.env[WORKER_DEFAULT_BACKOFF_MAX_DELAY_MS_ENV],
    30_000,
  );

  return {
    maxAttempts: toPositiveInt(process.env[WORKER_DEFAULT_MAX_ATTEMPTS_ENV], 3),
    backoff: {
      strategy: readDefaultBackoffStrategy(),
      delayMs,
      maxDelayMs: Math.max(delayMs, maxDelayMs),
    },
  };
}

export const DEFAULT_WORKER_RETRY_POLICY: WorkerRetryPolicy =
  resolveDefaultWorkerRetryPolicy();

export function resolveWorkerRetryPolicy(
  input?: WorkerRetryPolicyInput | null,
): WorkerRetryPolicy {
  const maxAttempts = Math.max(
    1,
    Math.trunc(input?.maxAttempts ?? DEFAULT_WORKER_RETRY_POLICY.maxAttempts),
  );
  const delayMs = Math.max(
    0,
    Math.trunc(input?.backoff?.delayMs ?? DEFAULT_WORKER_RETRY_POLICY.backoff.delayMs),
  );
  const maxDelayCandidate = input?.backoff?.maxDelayMs;
  const maxDelayMs =
    maxDelayCandidate == null
      ? DEFAULT_WORKER_RETRY_POLICY.backoff.maxDelayMs ?? delayMs
      : Math.max(delayMs, Math.trunc(maxDelayCandidate));

  return {
    maxAttempts,
    backoff: {
      strategy:
        input?.backoff?.strategy ?? DEFAULT_WORKER_RETRY_POLICY.backoff.strategy,
      delayMs,
      maxDelayMs,
    },
  };
}

export function calculateWorkerBackoffDelayMs(input: {
  backoff: WorkerBackoffPolicy;
  retryAttempt: number;
}) {
  const retryAttempt = Math.max(1, Math.trunc(input.retryAttempt));

  if (input.backoff.strategy === WORKER_BACKOFF_STRATEGIES.FIXED) {
    return input.backoff.delayMs;
  }

  const delayMs = input.backoff.delayMs * 2 ** (retryAttempt - 1);

  return Math.min(delayMs, input.backoff.maxDelayMs ?? delayMs);
}

export function calculateWorkerNextRunAt(input: {
  from: Date | string;
  backoff: WorkerBackoffPolicy;
  retryAttempt: number;
}) {
  const from =
    input.from instanceof Date ? input.from : new Date(input.from);
  const delayMs = calculateWorkerBackoffDelayMs({
    backoff: input.backoff,
    retryAttempt: input.retryAttempt,
  });

  return new Date(from.getTime() + delayMs).toISOString();
}
