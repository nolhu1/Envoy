import "server-only";

const REDACTED_TEXT = "[REDACTED]";
const MAX_SANITIZED_STRING_LENGTH = 400;
const MAX_DIAGNOSTIC_DEPTH = 6;
const MAX_DIAGNOSTIC_ITEMS = 50;

const SENSITIVE_KEY_PATTERNS = [
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "api_key",
  "apikey",
  "private_key",
  "client_secret",
  "refresh",
] as const;

const TOKEN_VALUE_PATTERNS = [
  /xox[baprs]-[a-zA-Z0-9-]+/g,
  /\b(Bearer)\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  /\bya29\.[a-zA-Z0-9\-._~+/]+=*/g,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldRedactKey(key: string) {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function truncateString(value: string) {
  if (value.length <= MAX_SANITIZED_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_SANITIZED_STRING_LENGTH)}...`;
}

export function redactSensitiveText(value: string) {
  let sanitized = value;

  for (const pattern of TOKEN_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED_TEXT);
  }

  return truncateString(sanitized);
}

function sanitizeValue(
  value: unknown,
  depth: number,
): unknown {
  if (depth > MAX_DIAGNOSTIC_DEPTH) {
    return "[TRUNCATED]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value == null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_DIAGNOSTIC_ITEMS).map((item) =>
      sanitizeValue(item, depth + 1),
    );
  }

  if (isObject(value)) {
    const sanitized: Record<string, unknown> = {};
    const entries = Object.entries(value).slice(0, MAX_DIAGNOSTIC_ITEMS);

    for (const [key, nextValue] of entries) {
      sanitized[key] = shouldRedactKey(key)
        ? REDACTED_TEXT
        : sanitizeValue(nextValue, depth + 1);
    }

    return sanitized;
  }

  return String(value);
}

export function sanitizeDiagnostics(value: unknown) {
  const sanitized = sanitizeValue(value, 0);
  return isObject(sanitized) ? sanitized : { value: sanitized };
}

export function sanitizeErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (error instanceof Error) {
    return redactSensitiveText(error.message || fallback);
  }

  if (typeof error === "string" && error.trim()) {
    return redactSensitiveText(error);
  }

  return fallback;
}

export function sanitizeUiErrorMessage(error: unknown) {
  return sanitizeErrorMessage(error, "An unexpected error occurred.");
}

export function sanitizeUiText(
  value: unknown,
  fallback = "Unavailable",
) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return redactSensitiveText(value);
}
