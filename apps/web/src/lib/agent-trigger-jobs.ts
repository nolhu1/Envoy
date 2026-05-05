import type { EnvoyEvent } from "../../../../packages/events/src/index";
import {
  WORKER_JOB_TYPES,
  type AgentRunFromTriggerJobPayload,
} from "../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../worker/src/queues";

import {
  buildAgentTriggerRuntimeJobDedupeKey,
  parseAutomaticAgentTriggerFromEvent,
} from "./agent-trigger-contract";

export async function enqueueAutomaticAgentTriggerForEvent(event: EnvoyEvent) {
  const parsed = parseAutomaticAgentTriggerFromEvent(event);

  if (parsed.status === "ignored") {
    return parsed;
  }

  const payload: AgentRunFromTriggerJobPayload = {
    workspaceId: parsed.workspaceId,
    conversationId: parsed.conversationId,
    triggerType: parsed.triggerType as AgentRunFromTriggerJobPayload["triggerType"],
    sourceEventId: parsed.sourceEventId,
    sourceMessageId: parsed.trigger.sourceMessageId ?? null,
    sourceApprovalRequestId: parsed.trigger.sourceApprovalRequestId ?? null,
    requestedAt: new Date().toISOString(),
  };

  const enqueueResult = await enqueueRuntimeJob({
    queueName: WORKER_QUEUE_NAMES.AGENT,
    jobType: WORKER_JOB_TYPES.AGENT_RUN_FROM_TRIGGER,
    workspaceId: parsed.workspaceId,
    payload,
    dedupeKey: buildAgentTriggerRuntimeJobDedupeKey({
      workspaceId: parsed.workspaceId,
      conversationId: parsed.conversationId,
      triggerType: parsed.triggerType,
      sourceMessageId: payload.sourceMessageId,
      sourceApprovalRequestId: payload.sourceApprovalRequestId,
    }),
    sourceEventId: parsed.sourceEventId,
    retryPolicy: {
      maxAttempts: 1,
    },
  });

  return {
    status: "enqueued" as const,
    ...payload,
    runtimeJobId: enqueueResult.runtimeJobId,
    bullJobId: enqueueResult.bullJobId,
    created: enqueueResult.created,
    queued: enqueueResult.queued,
  };
}
