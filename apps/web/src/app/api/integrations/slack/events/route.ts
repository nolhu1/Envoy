import { verifySlackRequestSignature } from "@envoy/connectors";
import { getPrisma } from "@envoy/db";
import { NextResponse } from "next/server";

import {
  ingestSlackWebhookMessageEvent,
  type SlackWebhookMessageEventInput,
} from "@/lib/slack-ingestion";
import { sanitizeDiagnostics, sanitizeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

type SlackEventsPayload = {
  token?: string;
  challenge?: string;
  type?: string;
  team_id?: string;
  api_app_id?: string;
  event_id?: string;
  event_time?: number;
  event?: SlackMessageEventPayload;
  authorizations?: Array<{
    team_id?: string;
    enterprise_id?: string | null;
    user_id?: string;
    is_bot?: boolean;
  }>;
};

type SlackMessageEventPayload = {
  type?: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  files?: SlackWebhookFilePayload[];
  team?: string;
  event_ts?: string;
  client_msg_id?: string;
};

type SlackWebhookFilePayload = {
  id?: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  size?: number;
  url_private?: string;
  permalink?: string;
};

type SlackIntegrationRouteRecord = {
  id: string;
  workspaceId: string;
  platformMetadataJson: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSlackEventsPayload(value: unknown): SlackEventsPayload | null {
  return isObject(value) ? (value as SlackEventsPayload) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTeamId(payload: SlackEventsPayload) {
  return (
    readString(payload.team_id) ??
    readString(payload.event?.team) ??
    readString(payload.authorizations?.[0]?.team_id)
  );
}

function readSlackBotUserId(metadata: unknown) {
  if (!isObject(metadata)) {
    return null;
  }

  return readString(metadata.slackBotUserId);
}

function isSupportedMessageSubtype(subtype: string | undefined) {
  return !subtype || subtype === "file_share";
}

function isDirectMessageEvent(event: SlackMessageEventPayload) {
  const channel = readString(event.channel);

  return event.channel_type === "im" || Boolean(channel?.startsWith("D"));
}

function shouldIgnoreMessageEvent(input: {
  event: SlackMessageEventPayload;
  botUserId: string | null;
}) {
  if (!isSupportedMessageSubtype(input.event.subtype)) {
    return "unsupported_message_subtype";
  }

  if (input.event.bot_id || input.event.subtype === "bot_message") {
    return "bot_message";
  }

  if (input.botUserId && input.event.user === input.botUserId) {
    return "self_message";
  }

  if (!readString(input.event.channel) || !readString(input.event.ts)) {
    return "missing_channel_or_ts";
  }

  return null;
}

function toSlackMessage(
  event: SlackMessageEventPayload,
): SlackWebhookMessageEventInput["event"] {
  return {
    type: event.type,
    subtype: event.subtype,
    channel: event.channel,
    ts: event.ts ?? "",
    thread_ts: event.thread_ts,
    text: event.text,
    user: event.user,
    bot_id: event.bot_id,
    team: event.team,
    files: event.files,
    client_msg_id: event.client_msg_id,
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  return NextResponse.json(body, init);
}

async function readConfiguredSigningSecrets() {
  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      platform: "SLACK",
      status: "CONNECTED",
      deletedAt: null,
    },
    select: {
      configJson: true,
    },
  });
  const secrets = new Set<string>();

  for (const integration of integrations) {
    const config = isObject(integration.configJson)
      ? integration.configJson
      : null;
    const signingSecret =
      readString(config?.slackSigningSecret) ?? readString(config?.signingSecret);

    if (signingSecret) {
      secrets.add(signingSecret);
    }
  }

  return [...secrets];
}

async function verifyRequestSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
}) {
  const envVerification = verifySlackRequestSignature(input);

  if (
    envVerification.verified ||
    envVerification.reason !== "missing_signing_secret"
  ) {
    return envVerification;
  }

  let configuredSigningSecrets: string[] = [];
  try {
    configuredSigningSecrets = await readConfiguredSigningSecrets();
  } catch (error) {
    console.error(
      "[slack-webhook] signing secret lookup failed",
      JSON.stringify(
        sanitizeDiagnostics({
          error: sanitizeErrorMessage(
            error,
            "Unknown Slack signing secret lookup error.",
          ),
        }),
      ),
    );
  }

  for (const signingSecret of configuredSigningSecrets) {
    const configVerification = verifySlackRequestSignature({
      ...input,
      signingSecret,
    });

    if (configVerification.verified) {
      return configVerification;
    }
  }

  return envVerification;
}

async function findConnectedSlackIntegration(teamId: string) {
  const prisma = getPrisma();
  const integrations = await prisma.integration.findMany({
    where: {
      platform: "SLACK",
      externalAccountId: teamId,
      status: "CONNECTED",
      deletedAt: null,
    },
    select: {
      id: true,
      workspaceId: true,
      platformMetadataJson: true,
    },
    take: 2,
  });

  if (integrations.length !== 1) {
    return {
      integration: null,
      reason: integrations.length === 0
        ? "no_connected_integration"
        : "ambiguous_connected_integrations",
    };
  }

  return {
    integration: integrations[0] as SlackIntegrationRouteRecord,
    reason: null,
  };
}

function logIgnoredEvent(input: {
  teamId: string | null;
  eventId: string | null;
  reason: string;
  eventType?: string | null;
}) {
  console.info(
    "[slack-webhook] ignored event",
    JSON.stringify(
      sanitizeDiagnostics({
        teamId: input.teamId,
        eventId: input.eventId,
        eventType: input.eventType ?? null,
        reason: input.reason,
      }),
    ),
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyRequestSignature({
    rawBody,
    signatureHeader: request.headers.get("x-slack-signature"),
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
  });

  if (!verification.verified) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_signature",
        reason: verification.reason,
      },
      {
        status: 401,
      },
    );
  }

  let payload: SlackEventsPayload | null = null;
  try {
    payload = toSlackEventsPayload(rawBody ? JSON.parse(rawBody) : null);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: sanitizeErrorMessage(error, "invalid_json"),
      },
      {
        status: 400,
      },
    );
  }

  if (!payload) {
    return jsonResponse(
      {
        ok: false,
        error: "invalid_payload",
      },
      {
        status: 400,
      },
    );
  }

  if (payload.type === "url_verification") {
    const challenge = readString(payload.challenge);

    if (!challenge) {
      return jsonResponse(
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

  if (payload.type !== "event_callback") {
    logIgnoredEvent({
      teamId: readTeamId(payload),
      eventId: payload.event_id ?? null,
      eventType: payload.type ?? null,
      reason: "unsupported_payload_type",
    });

    return jsonResponse({
      ok: true,
      ignored: true,
      reason: "unsupported_payload_type",
    });
  }

  const teamId = readTeamId(payload);

  if (!teamId) {
    return jsonResponse(
      {
        ok: false,
        error: "missing_team_id",
      },
      {
        status: 400,
      },
    );
  }

  const event = payload.event;

  if (!event || event.type !== "message") {
    logIgnoredEvent({
      teamId,
      eventId: payload.event_id ?? null,
      eventType: event?.type ?? null,
      reason: "unsupported_event_type",
    });

    return jsonResponse({
      ok: true,
      ignored: true,
      reason: "unsupported_event_type",
    });
  }

  if (!isDirectMessageEvent(event)) {
    logIgnoredEvent({
      teamId,
      eventId: payload.event_id ?? null,
      eventType: event.type,
      reason: "non_dm_message",
    });

    return jsonResponse({
      ok: true,
      ignored: true,
      reason: "non_dm_message",
    });
  }

  const { integration, reason } = await findConnectedSlackIntegration(teamId);

  if (!integration) {
    return jsonResponse(
      {
        ok: false,
        error: reason ?? "integration_not_found",
      },
      {
        status: reason === "ambiguous_connected_integrations" ? 409 : 404,
      },
    );
  }

  const ignoreReason = shouldIgnoreMessageEvent({
    event,
    botUserId: readSlackBotUserId(integration.platformMetadataJson),
  });

  if (ignoreReason) {
    logIgnoredEvent({
      teamId,
      eventId: payload.event_id ?? null,
      eventType: event.type,
      reason: ignoreReason,
    });

    return jsonResponse({
      ok: true,
      ignored: true,
      reason: ignoreReason,
    });
  }

  let result: Awaited<ReturnType<typeof ingestSlackWebhookMessageEvent>>;
  try {
    result = await ingestSlackWebhookMessageEvent({
      workspaceId: integration.workspaceId,
      integrationId: integration.id,
      teamId,
      eventId: payload.event_id ?? null,
      eventTime:
        typeof payload.event_time === "number" ? payload.event_time : null,
      event: toSlackMessage(event),
      rawPayloadJson: payload as SlackWebhookMessageEventInput["rawPayloadJson"],
    });
  } catch (error) {
    console.error(
      "[slack-webhook] ingestion failed",
      JSON.stringify(
        sanitizeDiagnostics({
          teamId,
          eventId: payload.event_id ?? null,
          integrationId: integration.id,
          error: sanitizeErrorMessage(
            error,
            "Unknown Slack webhook ingestion error.",
          ),
        }),
      ),
    );

    return jsonResponse(
      {
        ok: false,
        error: "ingestion_failed",
      },
      {
        status: 500,
      },
    );
  }

  return jsonResponse({
    ok: true,
    ingested: true,
    insertedMessageCount: result.insertedMessageCount,
    insertedEventCount: result.insertedEventCount,
  });
}
