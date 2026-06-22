"use server";

import { redirect } from "next/navigation";

import {
  WORKER_JOB_TYPES,
} from "../../../../worker/src/jobs";
import {
  WORKER_QUEUE_NAMES,
  enqueueRuntimeJob,
} from "../../../../worker/src/queues";

import { PERMISSIONS, requirePermission } from "@/lib/permissions";
import { sanitizeUiErrorMessage } from "@/lib/security";

export async function evaluateFollowUpsNowAction() {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);

  try {
    const requestedAt = new Date().toISOString();
    const result = await enqueueRuntimeJob({
      queueName: WORKER_QUEUE_NAMES.AGENT,
      jobType: WORKER_JOB_TYPES.AGENT_EVALUATE_FOLLOW_UPS,
      workspaceId: authContext.workspaceId,
      payload: {
        workspaceId: authContext.workspaceId,
        requestedAt,
        reason: "manual",
      },
      dedupeKey: [
        "agent",
        "evaluate_follow_ups",
        authContext.workspaceId,
        requestedAt.slice(0, 16),
      ].join(":"),
      retryPolicy: {
        maxAttempts: 1,
      },
    });

    redirect(`/agent-runs?followUps=queued&jobId=${result.runtimeJobId}`);
  } catch (error) {
    redirect(
      `/agent-runs?followUps=error&message=${encodeURIComponent(
        sanitizeUiErrorMessage(error) || "Unable to queue follow-up evaluation.",
      )}`,
    );
  }
}
