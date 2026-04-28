import { NextResponse } from "next/server";
import { verifySlackRequestSignature } from "@envoy/connectors";

import { sanitizeDiagnostics, sanitizeErrorMessage } from "@/lib/security";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-slack-signature");
  const timestampHeader = request.headers.get("x-slack-request-timestamp");
  const verification = verifySlackRequestSignature({
    rawBody,
    signatureHeader,
    timestampHeader,
  });

  if (!verification.verified) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_signature",
      },
      {
        status: 401,
      },
    );
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as unknown) : null;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeErrorMessage(error, "invalid_json"),
      },
      {
        status: 400,
      },
    );
  }

  if (isObject(payload) && payload.type === "url_verification") {
    const challenge =
      typeof payload.challenge === "string" ? payload.challenge : null;

    if (!challenge) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_challenge",
        },
        {
          status: 400,
        },
      );
    }

    return new NextResponse(challenge, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  console.info(
    "[slack-webhook] verified event received",
    JSON.stringify(
      sanitizeDiagnostics({
        type: isObject(payload) ? payload.type ?? null : null,
        eventType:
          isObject(payload) && isObject(payload.event)
            ? payload.event.type ?? null
            : null,
        teamId: isObject(payload) ? payload.team_id ?? null : null,
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    received: true,
  });
}
