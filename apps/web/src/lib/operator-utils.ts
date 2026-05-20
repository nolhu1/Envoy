import "server-only";

import { sanitizeDiagnostics, sanitizeUiText } from "@/lib/security";

export function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readOperatorString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readOperatorDate(value: unknown) {
  const candidate = readOperatorString(value);

  if (!candidate) {
    return null;
  }

  const date = new Date(candidate);

  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatOperatorType(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

export function sanitizeOperatorMetadata(value: unknown) {
  if (!isOperatorObject(value)) {
    return {};
  }

  return sanitizeDiagnostics(value);
}

export function summarizeOperatorMetadata(value: unknown, maxKeys = 5) {
  const metadata = sanitizeOperatorMetadata(value);
  const keys = Object.keys(metadata);

  if (keys.length === 0) {
    return "No metadata recorded.";
  }

  return keys.slice(0, maxKeys).join(", ");
}

export function readPayloadString(
  value: unknown,
  key: string,
): string | null {
  return isOperatorObject(value) ? readOperatorString(value[key]) : null;
}

export function readErrorSummary(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return sanitizeUiText(value);
  }

  if (!isOperatorObject(value)) {
    return null;
  }

  return readOperatorString(value.message)
    ? sanitizeUiText(String(value.message))
    : null;
}

export function parsePositiveLimit(value: unknown, fallback = 100, max = 500) {
  const parsed =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
}
