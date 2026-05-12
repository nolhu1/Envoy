import {
  createPrismaIdempotencyService,
  getPrisma,
} from "../../../packages/db/src/index";
import {
  CONVERSATION_STATES,
  isTerminalConversationState,
} from "../../../packages/events/src/index";
import { WORKER_JOB_TYPES, type WorkerJob } from "./jobs";
import {
  WorkerJobRegistry,
  WORKER_JOB_STATUSES,
  type WorkerJobError,
  type WorkerJobResult,
} from "./registry";

function createPlaceholderResult(job: WorkerJob): WorkerJobResult {
  return {
    status: WORKER_JOB_STATUSES.COMPLETED,
    handledAt: new Date().toISOString(),
    output: {
      placeholder: true,
      jobType: job.jobType,
      workspaceId: job.workspaceId,
    },
  };
}

function toWorkerJobError(error: unknown): WorkerJobError {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null,
      retryable: null,
    };
  }

  return {
    message: typeof error === "string" ? error : "Unknown worker job failure.",
    details:
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : null,
    retryable: null,
  };
}

async function markOutboundMessageFailed(input: {
  workspaceId: string;
  messageId: string;
}) {
  const prisma = getPrisma();

  await prisma.message.updateMany({
    where: {
      id: input.messageId,
      workspaceId: input.workspaceId,
      direction: "OUTBOUND",
      status: {
        notIn: ["SENT", "DELIVERED"],
      },
    },
    data: {
      status: "FAILED",
    },
  });
}

const manualAgentRunIdempotencyService = createPrismaIdempotencyService({
  lockOwner: "worker:manual-agent-run",
});

function buildManualAgentRunIdempotencyKey(input: {
  workspaceId: string;
  conversationId: string;
  requestedByUserId: string;
  requestNonce: string;
}) {
  return {
    scope: "agent" as const,
    key: [
      "agent",
      "manual_regenerate",
      input.workspaceId,
      input.conversationId,
      input.requestedByUserId,
      input.requestNonce,
    ].join(":"),
    workspaceId: input.workspaceId,
    operationType: "manual_regenerate",
    resourceType: "conversation",
    resourceId: input.conversationId,
    externalEventId: input.requestNonce,
  };
}

function createManualAgentRunSuppressedResult(input: {
  reason: string;
  conversationId: string;
  assignmentId?: string | null;
}) {
  return {
    status: WORKER_JOB_STATUSES.COMPLETED,
    handledAt: new Date().toISOString(),
    output: {
      status: "suppressed",
      reason: input.reason,
      conversationId: input.conversationId,
      assignmentId: input.assignmentId ?? null,
    },
  } satisfies WorkerJobResult;
}

export function createWorkerJobRegistry() {
  return new WorkerJobRegistry()
    .register(WORKER_JOB_TYPES.SYNC_GMAIL_INTEGRATION, async ({ job }) => {
      process.env.ENVOY_DISABLE_INLINE_AGENT_TRIGGERS ??= "true";
      const { syncWorkspaceGmailIntegration } = await import(
        "../../web/src/lib/gmail-ingestion"
      );
      const result = await syncWorkspaceGmailIntegration({
        workspaceId: job.workspaceId,
        integrationId: job.payload.integrationId,
      });

      return {
        status: WORKER_JOB_STATUSES.COMPLETED,
        handledAt: new Date().toISOString(),
        output: {
          provider: "gmail",
          reason: job.payload.reason,
          requestedByUserId: job.payload.requestedByUserId,
          ...result,
        },
      };
    })
    .register(WORKER_JOB_TYPES.SYNC_SLACK_INTEGRATION, async ({ job }) => {
      process.env.ENVOY_DISABLE_INLINE_AGENT_TRIGGERS ??= "true";
      const { syncWorkspaceSlackIntegration } = await import(
        "../../web/src/lib/slack-ingestion"
      );
      const result = await syncWorkspaceSlackIntegration({
        workspaceId: job.workspaceId,
        integrationId: job.payload.integrationId,
      });

      return {
        status: WORKER_JOB_STATUSES.COMPLETED,
        handledAt: new Date().toISOString(),
        output: {
          provider: "slack",
          reason: job.payload.reason,
          requestedByUserId: job.payload.requestedByUserId,
          ...result,
        },
      };
    })
    .register(WORKER_JOB_TYPES.OUTBOUND_SEND_MESSAGE, async ({ job }) => {
      process.env.ENVOY_DISABLE_INLINE_AGENT_TRIGGERS ??= "true";
      const prisma = getPrisma();
      const isFinalAttempt = job.attempt + 1 >= job.retryPolicy.maxAttempts;
      const message = await prisma.message.findFirst({
        where: {
          id: job.payload.messageId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          workspaceId: true,
          conversationId: true,
          platform: true,
          senderType: true,
          direction: true,
          status: true,
          conversation: {
            select: {
              id: true,
              workspaceId: true,
              integrationId: true,
              platform: true,
              integration: {
                select: {
                  id: true,
                  workspaceId: true,
                  platform: true,
                },
              },
            },
          },
          approvalRequests: {
            select: {
              id: true,
              status: true,
            },
            orderBy: [{ createdAt: "desc" }],
          },
        },
      });

      try {
        if (!message) {
          throw new Error("Outbound message could not be loaded.");
        }

        if (
          job.payload.sendSource !== "manual" &&
          job.payload.sendSource !== "approval"
        ) {
          throw new Error("Unsupported outbound send source.");
        }

        if (message.direction !== "OUTBOUND") {
          throw new Error("Only outbound messages can be sent.");
        }

        if (
          message.conversationId !== job.payload.conversationId ||
          message.conversation.integrationId !== job.payload.integrationId ||
          message.platform !== job.payload.platform ||
          message.conversation.platform !== job.payload.platform ||
          message.conversation.integration.platform !== job.payload.platform
        ) {
          throw new Error("Outbound send job payload does not match the canonical message.");
        }

        const actorUserId = job.payload.requestedByUserId;

        if (!actorUserId) {
          throw new Error("Outbound send jobs require the requesting user id.");
        }

        if (job.payload.sendSource === "manual") {
          if (job.payload.approvalRequestId) {
            throw new Error("Manual outbound send jobs must not include approval requests.");
          }

          if (message.senderType !== "USER") {
            throw new Error("Manual outbound send jobs may only send human-authored messages.");
          }

          if (message.approvalRequests.length > 0) {
            throw new Error("Manual outbound send jobs must not send approval-gated drafts.");
          }
        }

        if (job.payload.sendSource === "approval") {
          if (!job.payload.approvalRequestId) {
            throw new Error("Approval outbound send jobs require approvalRequestId.");
          }

          if (message.senderType !== "AGENT") {
            throw new Error("Approval outbound send jobs may only send AI draft messages.");
          }

          if (message.status !== "QUEUED" && message.status !== "APPROVED") {
            throw new Error("Approved draft is not in a sendable queued state.");
          }

          const approvalRequest = await prisma.approvalRequest.findFirst({
            where: {
              id: job.payload.approvalRequestId,
              workspaceId: job.workspaceId,
            },
            select: {
              id: true,
              workspaceId: true,
              conversationId: true,
              draftMessageId: true,
              status: true,
            },
          });

          if (!approvalRequest) {
            throw new Error("Approval request could not be loaded for send.");
          }

          if (approvalRequest.status !== "APPROVED") {
            throw new Error("Approval request must be approved before send.");
          }

          if (
            approvalRequest.draftMessageId !== job.payload.messageId ||
            approvalRequest.conversationId !== job.payload.conversationId
          ) {
            throw new Error("Approval request does not match outbound send job.");
          }
        }

        const result =
          job.payload.platform === "EMAIL"
            ? await import("../../web/src/lib/gmail-send").then(
                ({ sendWorkspaceGmailReply }) =>
                  sendWorkspaceGmailReply({
                    workspaceId: job.workspaceId,
                    actorUserId,
                    messageId: job.payload.messageId,
                  }),
              )
            : await import("../../web/src/lib/slack-send").then(
                ({ sendWorkspaceSlackReply }) =>
                  sendWorkspaceSlackReply({
                    workspaceId: job.workspaceId,
                    actorUserId,
                    messageId: job.payload.messageId,
                  }),
              );

        if (
          result.sendStatus === "FAILED" ||
          result.sendStatus === "REJECTED"
        ) {
          await markOutboundMessageFailed({
            workspaceId: job.workspaceId,
            messageId: job.payload.messageId,
          });

          return {
            status: WORKER_JOB_STATUSES.FAILED,
            handledAt: new Date().toISOString(),
            output: {
              ...result,
              sendSource: job.payload.sendSource,
            },
            error: {
              message: `Outbound send failed with status ${result.sendStatus}.`,
              retryable: true,
            },
          };
        }

        return {
          status: WORKER_JOB_STATUSES.COMPLETED,
          handledAt: new Date().toISOString(),
          output: {
            ...result,
            sendSource: job.payload.sendSource,
          },
        };
      } catch (error) {
        if (isFinalAttempt) {
          await markOutboundMessageFailed({
            workspaceId: job.workspaceId,
            messageId: job.payload.messageId,
          });
        }

        return {
          status: WORKER_JOB_STATUSES.FAILED,
          handledAt: new Date().toISOString(),
          error: toWorkerJobError(error),
        };
      }
    })
    .register(WORKER_JOB_TYPES.AGENT_RUN_FROM_TRIGGER, async ({ job }) => {
      process.env.ENVOY_DISABLE_INLINE_AGENT_TRIGGERS ??= "true";
      const prisma = getPrisma();

      if (job.payload.workspaceId !== job.workspaceId) {
        throw new Error("Agent trigger job workspace mismatch.");
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: job.payload.conversationId,
          workspaceId: job.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!conversation) {
        throw new Error("Agent trigger conversation could not be loaded.");
      }

      const { executeAutomaticAgentTriggerFromJob } = await import(
        "../../web/src/lib/agent-trigger-runtime"
      );
      const result = await executeAutomaticAgentTriggerFromJob(job.payload);

      if (result.status === "failed") {
        return {
          status: WORKER_JOB_STATUSES.FAILED,
          handledAt: new Date().toISOString(),
          output: {
            ...result,
          },
          error: {
            message: "Automatic agent trigger failed.",
            details:
              result.error && typeof result.error === "object"
                ? (result.error as Record<string, unknown>)
                : { error: result.error },
            retryable: false,
          },
        };
      }

      return {
        status: WORKER_JOB_STATUSES.COMPLETED,
        handledAt: new Date().toISOString(),
        output: {
          ...result,
        },
      };
    })
    .register(WORKER_JOB_TYPES.AGENT_RUN_MANUAL, async ({ job }) => {
      process.env.ENVOY_DISABLE_INLINE_AGENT_TRIGGERS ??= "true";
      const prisma = getPrisma();

      if (job.payload.workspaceId !== job.workspaceId) {
        throw new Error("Manual agent job workspace mismatch.");
      }

      if (job.payload.triggerType !== "manual_regenerate") {
        throw new Error("Manual agent job must use manual_regenerate trigger.");
      }

      const requestedByUser = await prisma.user.findFirst({
        where: {
          id: job.payload.requestedByUserId,
          workspaceId: job.workspaceId,
        },
        select: {
          id: true,
        },
      });

      if (!requestedByUser) {
        throw new Error("Manual agent job requester could not be loaded.");
      }

      const idempotencyKey = buildManualAgentRunIdempotencyKey({
        workspaceId: job.workspaceId,
        conversationId: job.payload.conversationId,
        requestedByUserId: job.payload.requestedByUserId,
        requestNonce: job.payload.requestNonce,
      });
      const beginRecord = await manualAgentRunIdempotencyService.begin({
        key: idempotencyKey,
      });

      if (beginRecord.status !== "in_progress") {
        return createManualAgentRunSuppressedResult({
          reason:
            beginRecord.status === "duplicate"
              ? "duplicate_manual_run_in_progress"
              : "duplicate_manual_run_already_processed",
          conversationId: job.payload.conversationId,
        });
      }

      try {
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: job.payload.conversationId,
            workspaceId: job.workspaceId,
            deletedAt: null,
          },
          select: {
            id: true,
            state: true,
            assignedAgentId: true,
            assignedAgent: {
              select: {
                id: true,
                isActive: true,
              },
            },
            approvalRequests: {
              where: {
                status: "PENDING",
              },
              take: 1,
              select: {
                id: true,
              },
            },
          },
        });

        if (!conversation) {
          await manualAgentRunIdempotencyService.complete({
            key: idempotencyKey,
            resultSummaryJson: {
              status: "suppressed",
              reason: "conversation_not_found",
            },
          });
          return createManualAgentRunSuppressedResult({
            reason: "conversation_not_found",
            conversationId: job.payload.conversationId,
          });
        }

        if (!conversation.assignedAgent?.isActive) {
          await manualAgentRunIdempotencyService.complete({
            key: idempotencyKey,
            resultSummaryJson: {
              status: "suppressed",
              reason: "no_active_assignment",
              assignmentId: conversation.assignedAgentId ?? null,
            },
          });
          return createManualAgentRunSuppressedResult({
            reason: "no_active_assignment",
            conversationId: conversation.id,
            assignmentId: conversation.assignedAgentId,
          });
        }

        if (isTerminalConversationState(conversation.state)) {
          await manualAgentRunIdempotencyService.complete({
            key: idempotencyKey,
            resultSummaryJson: {
              status: "suppressed",
              reason: "terminal_state",
              conversationState: conversation.state,
              assignmentId: conversation.assignedAgent.id,
            },
          });
          return createManualAgentRunSuppressedResult({
            reason: "terminal_state",
            conversationId: conversation.id,
            assignmentId: conversation.assignedAgent.id,
          });
        }

        if (
          conversation.state === CONVERSATION_STATES.AWAITING_APPROVAL ||
          conversation.approvalRequests.length > 0
        ) {
          await manualAgentRunIdempotencyService.complete({
            key: idempotencyKey,
            resultSummaryJson: {
              status: "suppressed",
              reason: "unresolved_approval_path",
              assignmentId: conversation.assignedAgent.id,
            },
          });
          return createManualAgentRunSuppressedResult({
            reason: "unresolved_approval_path",
            conversationId: conversation.id,
            assignmentId: conversation.assignedAgent.id,
          });
        }

        const { generateDraftAndCreateApprovalForWorkspace } = await import(
          "../../web/src/lib/agent-draft-flow"
        );
        const result = await generateDraftAndCreateApprovalForWorkspace({
          workspaceId: job.workspaceId,
          actorUserId: job.payload.requestedByUserId,
          skipPermissionCheck: true,
          conversationId: conversation.id,
          trigger: {
            triggerType: "manual_regenerate",
            triggerReason: "Manual run requested from conversation thread UI.",
            metadata: {
              source: "conversation_thread_ui",
              requestNonce: job.payload.requestNonce,
              runtimeJobId: job.jobId,
              requestedAt: job.payload.requestedAt,
            },
          },
        });

        await manualAgentRunIdempotencyService.complete({
          key: idempotencyKey,
          resultSummaryJson: {
            status: "executed",
            flowStatus: result.status,
            approvalRequestId: result.approval?.approvalRequestId ?? null,
            draftMessageId: result.approval?.draftMessageId ?? null,
            assignmentId: conversation.assignedAgent.id,
          },
        });

        return {
          status: WORKER_JOB_STATUSES.COMPLETED,
          handledAt: new Date().toISOString(),
          output: {
            status: "executed",
            flowStatus: result.status,
            approvalRequestId: result.approval?.approvalRequestId ?? null,
            draftMessageId: result.approval?.draftMessageId ?? null,
            escalationReasonCode:
              result.escalation.escalationReasonCode ?? null,
          },
        };
      } catch (error) {
        const workerError = toWorkerJobError(error);
        await manualAgentRunIdempotencyService.fail({
          key: idempotencyKey,
          resultSummaryJson: {
            status: "failed",
            error: {
              message: workerError.message,
              code: workerError.code ?? null,
              retryable: workerError.retryable ?? null,
            },
          },
        });

        return {
          status: WORKER_JOB_STATUSES.FAILED,
          handledAt: new Date().toISOString(),
          error: workerError,
        };
      }
    })
    .register(WORKER_JOB_TYPES.MAINTENANCE_HEALTH_CHECK, async ({ job }) => {
      console.log("[worker] maintenance.health_check", job.jobId, job.payload);

      if (job.payload.fail) {
        return {
          status: WORKER_JOB_STATUSES.FAILED,
          handledAt: new Date().toISOString(),
          error: {
            message: "Requested maintenance health check proof failure.",
            code: "maintenance_health_check_failed",
            retryable: job.payload.failRetryable ?? true,
          },
        };
      }

      return createPlaceholderResult(job);
    })
    .register(WORKER_JOB_TYPES.MAINTENANCE_RECOVER_STUCK_JOBS, async ({ job }) => {
      const { createBullMqWorkerRuntime } = await import("./queues");
      const runtime = createBullMqWorkerRuntime(new WorkerJobRegistry(), {
        workerId: `maintenance-${process.pid}`,
      });

      try {
        const summary = await runtime.recoverStuckJobs({
          staleAfterMs: job.payload.staleAfterMs ?? null,
          limit: job.payload.limit ?? null,
        });

        return {
          status: WORKER_JOB_STATUSES.COMPLETED,
          handledAt: new Date().toISOString(),
          output: {
            ...summary,
          },
        };
      } finally {
        await runtime.close();
      }
    })
    .register(WORKER_JOB_TYPES.MAINTENANCE_RENEW_GMAIL_WATCH, async ({ job }) => {
      if (job.payload.workspaceId !== job.workspaceId) {
        throw new Error("Gmail watch renewal job workspace mismatch.");
      }

      const prisma = getPrisma();
      const integration = await prisma.integration.findFirst({
        where: {
          id: job.payload.integrationId,
          workspaceId: job.workspaceId,
          platform: "EMAIL",
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!integration) {
        throw new Error("Gmail integration could not be loaded for watch renewal.");
      }

      const { renewGmailWatchForIntegration } = await import(
        "../../web/src/lib/gmail-ingestion"
      );
      const result = await renewGmailWatchForIntegration({
        workspaceId: job.workspaceId,
        integrationId: integration.id,
      });

      if (result.status === "error") {
        return {
          status: WORKER_JOB_STATUSES.FAILED,
          handledAt: new Date().toISOString(),
          output: {
            ...result,
            reason: job.payload.reason,
          },
          error: {
            message: result.error ?? "Gmail watch renewal failed.",
            retryable: true,
          },
        };
      }

      return {
        status: WORKER_JOB_STATUSES.COMPLETED,
        handledAt: new Date().toISOString(),
        output: {
          ...result,
          reason: job.payload.reason,
        },
      };
    })
    .register(WORKER_JOB_TYPES.EVENTS_PROCESS_EVENT_PLACEHOLDER, async ({ job }) => {
      console.log(
        "[worker] events.process_event_placeholder",
        job.jobId,
        job.payload,
      );
      return createPlaceholderResult(job);
    });
}
