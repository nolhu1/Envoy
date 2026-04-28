import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_SIGNING_SECRET_ENV = "SLACK_SIGNING_SECRET";
export const SLACK_SIGNATURE_VERSION = "v0";
export const DEFAULT_SLACK_SIGNATURE_MAX_AGE_SECONDS = 60 * 5;

export type SlackSignatureVerificationResult = {
  verified: boolean;
  reason: string | null;
  ageSeconds: number | null;
};

export type VerifySlackRequestSignatureInput = {
  rawBody: string;
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  signingSecret?: string;
  maxAgeSeconds?: number;
  now?: Date;
};

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTimestamp(timestampHeader?: string | null) {
  const value = timestampHeader?.trim();
  if (!value) {
    return null;
  }

  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.trunc(timestamp);
}

export function getSlackSigningSecret() {
  const signingSecret = process.env[SLACK_SIGNING_SECRET_ENV];
  if (!signingSecret || !signingSecret.trim()) {
    throw new Error(`${SLACK_SIGNING_SECRET_ENV} is not set.`);
  }

  return signingSecret.trim();
}

export function verifySlackRequestSignature(
  input: VerifySlackRequestSignatureInput,
): SlackSignatureVerificationResult {
  const signingSecret = input.signingSecret ?? process.env[SLACK_SIGNING_SECRET_ENV] ?? "";
  const signatureHeader = input.signatureHeader?.trim();
  const timestamp = parseTimestamp(input.timestampHeader);

  if (!signingSecret) {
    return {
      verified: false,
      reason: "missing_signing_secret",
      ageSeconds: null,
    };
  }

  if (!signatureHeader) {
    return {
      verified: false,
      reason: "missing_signature_header",
      ageSeconds: null,
    };
  }

  if (!timestamp) {
    return {
      verified: false,
      reason: "invalid_timestamp_header",
      ageSeconds: null,
    };
  }

  const now = input.now ?? new Date();
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);
  const maxAgeSeconds =
    input.maxAgeSeconds ?? DEFAULT_SLACK_SIGNATURE_MAX_AGE_SECONDS;

  if (ageSeconds > maxAgeSeconds) {
    return {
      verified: false,
      reason: "timestamp_out_of_window",
      ageSeconds,
    };
  }

  const baseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${input.rawBody}`;
  const expectedDigest = createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expectedSignature = `${SLACK_SIGNATURE_VERSION}=${expectedDigest}`;

  if (!safeCompare(signatureHeader, expectedSignature)) {
    return {
      verified: false,
      reason: "signature_mismatch",
      ageSeconds,
    };
  }

  return {
    verified: true,
    reason: null,
    ageSeconds,
  };
}
