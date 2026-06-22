import {
  AGENT_TRIGGER_TYPES,
  type AgentTriggerContext,
  type AgentTriggerType,
} from "../../../../packages/db/src/index";
import {
  ENVOY_EVENT_TYPES,
  type EnvoyEvent,
} from "../../../../packages/events/src/index";

export type AutomaticAgentTriggerEventContext = {
  workspaceId: string;
  conversationId: string;
  triggerType: AgentTriggerType;
  trigger: AgentTriggerContext;
  sourceEventId: string | null;
  sourceEventType: string | null;
  sourceEventSource: string | null;
};

export type AutomaticAgentTriggerParseResult =
  | {
      status: "ignored";
      reason: string;
    }
  | ({
      status: "accepted";
    } & AutomaticAgentTriggerEventContext);

export function buildAutomaticTriggerIdempotencyKey(
  context: AutomaticAgentTriggerEventContext,
) {
  const key =
    context.triggerType === AGENT_TRIGGER_TYPES.INBOUND_MESSAGE
      ? [
          "agent",
          "inbound_message",
          context.workspaceId,
          context.conversationId,
          context.trigger.sourceMessageId ?? "none",
        ].join(":")
      : context.triggerType === AGENT_TRIGGER_TYPES.APPROVAL_REJECTED
        ? [
            "agent",
            "approval_rejected",
            context.workspaceId,
            context.conversationId,
            context.trigger.sourceApprovalRequestId ?? "none",
          ].join(":")
        : [
            "agent",
            "follow_up_due",
            context.workspaceId,
            context.conversationId,
            context.trigger.metadata?.dedupeBucket ?? "due",
          ].join(":");

  return {
    key,
    scope: "agent" as const,
    workspaceId: context.workspaceId,
    operationType: context.triggerType,
    resourceType: "conversation",
    resourceId: context.conversationId,
    externalEventId: context.sourceEventId ?? key,
  };
}

export function buildAgentTriggerRuntimeJobDedupeKey(input: {
  workspaceId: string;
  conversationId: string;
  triggerType: AgentTriggerType;
  sourceMessageId?: string | null;
  sourceApprovalRequestId?: string | null;
}) {
  if (input.triggerType === AGENT_TRIGGER_TYPES.INBOUND_MESSAGE) {
    return [
      "agent",
      "inbound_message",
      input.workspaceId,
      input.conversationId,
      input.sourceMessageId ?? "none",
    ].join(":");
  }

  if (input.triggerType === AGENT_TRIGGER_TYPES.APPROVAL_REJECTED) {
    return [
      "agent",
      "approval_rejected",
      input.workspaceId,
      input.conversationId,
      input.sourceApprovalRequestId ?? "none",
    ].join(":");
  }

  return [
    "agent",
    "follow_up_due",
    input.workspaceId,
    input.conversationId,
    "due",
  ].join(":");
}

export function parseAutomaticAgentTriggerFromEvent(
  event: EnvoyEvent,
): AutomaticAgentTriggerParseResult {
  if (event.eventType === ENVOY_EVENT_TYPES.MESSAGE_RECEIVED) {
    const payload = event.payload;
    const conversationId = payload.conversationId?.trim();
    const messageId = payload.messageId?.trim();

    if (!conversationId || !messageId) {
      return {
        status: "ignored",
        reason: "message_received event is missing canonical ids.",
      };
    }

    if (payload.direction && payload.direction !== "INBOUND") {
      return {
        status: "ignored",
        reason: "message_received event is not inbound.",
      };
    }

    return {
      status: "accepted",
      workspaceId: event.workspaceId,
      conversationId,
      triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
      sourceEventId: event.eventId,
      sourceEventType: event.eventType,
      sourceEventSource: event.source,
      trigger: {
        triggerType: AGENT_TRIGGER_TYPES.INBOUND_MESSAGE,
        triggerReason:
          "Automatic run after canonical inbound message ingestion.",
        sourceMessageId: messageId,
        metadata: {
          automatic: true,
          sourceEventId: event.eventId,
          sourceEventType: event.eventType,
          sourceEventSource: event.source,
        },
      },
    };
  }

  if (event.eventType === ENVOY_EVENT_TYPES.APPROVAL_REJECTED) {
    const payload = event.payload;
    const conversationId = payload.conversationId?.trim();
    const approvalRequestId = payload.approvalRequestId?.trim();

    if (!conversationId || !approvalRequestId) {
      return {
        status: "ignored",
        reason: "approval_rejected event is missing canonical ids.",
      };
    }

    return {
      status: "accepted",
      workspaceId: event.workspaceId,
      conversationId,
      triggerType: AGENT_TRIGGER_TYPES.APPROVAL_REJECTED,
      sourceEventId: event.eventId,
      sourceEventType: event.eventType,
      sourceEventSource: event.source,
      trigger: {
        triggerType: AGENT_TRIGGER_TYPES.APPROVAL_REJECTED,
        triggerReason:
          "Automatic run after approval rejection for draft revision.",
        sourceApprovalRequestId: approvalRequestId,
        metadata: {
          automatic: true,
          rejectionReason: payload.rejectionReason ?? null,
          reviewedByUserId: payload.reviewedByUserId ?? null,
          sourceEventId: event.eventId,
          sourceEventType: event.eventType,
          sourceEventSource: event.source,
        },
      },
    };
  }

  return {
    status: "ignored",
    reason: `Unsupported event type ${event.eventType}.`,
  };
}
