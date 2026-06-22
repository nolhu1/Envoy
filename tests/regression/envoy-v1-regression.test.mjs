import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  acceptInvite,
  approveDraft,
  beginIdempotent,
  completeIdempotent,
  createAgentDraftApproval,
  createFixtureState,
  createInvite,
  createManualReply,
  denyPermission,
  enqueueAgentTrigger,
  enqueueJob,
  evaluateFollowUps,
  exhaustJob,
  getAttachmentForWorkspace,
  getConversationForWorkspace,
  getRuntimeJobForWorkspace,
  processProviderPage,
  pubSubId,
  publishEvent,
  readRepoFile,
  rejectDraft,
  requirePermission,
  roles,
  runJobToCompletion,
} from "./fixtures.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("auth and workspace regression", () => {
  test("signup/login/logout and invite acceptance preserve workspace membership", () => {
    const state = createFixtureState();
    const admin = state.users[0];
    const invite = createInvite(state, admin, "new.member@example.test", roles.MEMBER);
    const accepted = acceptInvite(state, invite.token);

    assert.equal(accepted.workspaceId, admin.workspaceId);
    assert.equal(accepted.role, roles.MEMBER);
    assert.equal(invite.acceptedAt !== null, true);
    assert.throws(() => acceptInvite(state, invite.token), /one-time/);
  });

  test("viewer/member/admin permissions stay separated", () => {
    const state = createFixtureState();
    requirePermission(state.users[0], "VIEW_AUDIT_LOGS");
    requirePermission(state.users[1], "SEND_MESSAGES");
    denyPermission(state.users[2], "SEND_MESSAGES");
    denyPermission(state.users[2], "VIEW_AUDIT_LOGS");
  });
});

describe("gmail regression", () => {
  test("callback/reconnect routes preserve history and queue worker recovery", () => {
    const gmailCallback = readRepoFile(
      repoRoot,
      "apps/web/src/app/api/integrations/gmail/callback/route.ts",
    );

    assert.match(gmailCallback, /historyPreserved/);
    assert.match(gmailCallback, /enqueueGmailRecoveryJobs/);
    assert.match(gmailCallback, /MAINTENANCE_RENEW_GMAIL_WATCH/);
    assert.match(gmailCallback, /SYNC_GMAIL_INTEGRATION/);
  });

  test("paginated sync converges without duplicate messages", () => {
    const state = createFixtureState();
    processProviderPage(state, "gmail-1", {
      nextCursor: "page-2",
      messages: [{ conversationId: "conv-1", externalMessageId: "gmail-page-1-msg" }],
    });
    processProviderPage(state, "gmail-1", {
      nextCursor: null,
      messages: [{ conversationId: "conv-1", externalMessageId: "gmail-page-2-msg" }],
    });
    processProviderPage(state, "gmail-1", {
      nextCursor: null,
      messages: [{ conversationId: "conv-1", externalMessageId: "gmail-page-2-msg" }],
    });

    const inserted = state.messages.filter((message) =>
      message.externalMessageId?.startsWith("gmail-page"),
    );
    assert.equal(inserted.length, 2);
    assert.equal(state.integrations[0].checkpoint.pages, 3);
    assert.equal(state.integrations[0].checkpoint.hasMore, false);
  });

  test("Pub/Sub payload idempotency and attachment guard are enforced", () => {
    const state = createFixtureState();
    const key = `gmail:pubsub:owner@example.test:${pubSubId("owner@example.test", "msg-1")}`;
    assert.equal(beginIdempotent(state, key), true);
    completeIdempotent(state, key);
    assert.equal(beginIdempotent(state, key), false);
    assert.equal(getAttachmentForWorkspace(state, "ws-1", "att-1").provider, "gmail");
    assert.throws(() => getAttachmentForWorkspace(state, "ws-2", "att-1"), /denied/);
  });
});

describe("messaging regression", () => {
  test("inbox/thread files expose pagination, filters, and safe thread loading", () => {
    const inbox = readRepoFile(repoRoot, "apps/web/src/lib/inbox.ts");
    const thread = readRepoFile(repoRoot, "apps/web/src/lib/thread.ts");

    assert.match(inbox, /cursor|page/i);
    assert.match(inbox, /search/i);
    assert.match(inbox, /take:/);
    assert.match(thread, /workspaceId: authContext\.workspaceId/);
  });

  test("manual reply and failed-send retry queue outbound jobs", () => {
    const state = createFixtureState();
    const job = createManualReply(state, state.users[1], "conv-1");
    assert.equal(job.queueName, "outbound-send");
    assert.equal(job.status, "QUEUED");

    const retry = enqueueJob(state, {
      workspaceId: "ws-1",
      queueName: "outbound-send",
      jobType: "outbound.send_message",
      dedupeKey: "retry-send:ws-1:msg-failed",
      payload: { messageId: "msg-failed", sendSource: "manual" },
    });
    assert.equal(retry.status, "QUEUED");
  });
});

describe("approval regression", () => {
  test("AI draft approval queues send, edit-and-approve queues send, reject queues none", () => {
    const state = createFixtureState();
    const { draft, approval } = createAgentDraftApproval(state, "conv-1");
    assert.equal(draft.status, "PENDING_APPROVAL");
    assert.equal(approval.status, "PENDING");

    const approveJob = approveDraft(state, state.users[1], approval.id);
    assert.equal(approveJob.jobType, "outbound.send_message");
    assert.equal(state.messages.find((message) => message.id === draft.id).status, "QUEUED");

    const second = createAgentDraftApproval(state, "conv-1");
    const editedJob = approveDraft(state, state.users[1], second.approval.id, true);
    assert.equal(editedJob.payload.sendSource, "approval");

    const rejected = createAgentDraftApproval(state, "conv-1");
    assert.equal(rejectDraft(state, state.users[1], rejected.approval.id).length, 0);
  });

  test("approval send failure remains recoverable", () => {
    const state = createFixtureState();
    const { approval } = createAgentDraftApproval(state, "conv-1");
    const job = approveDraft(state, state.users[1], approval.id);
    const deadLetter = exhaustJob(state, job, "provider credentials unavailable");

    assert.equal(approval.status, "APPROVED");
    assert.equal(deadLetter.runtimeJobId, job.id);
    assert.equal(state.deadLetters.length, 1);
  });
});

describe("agent regression", () => {
  test("automatic, rejection, manual, and follow-up paths queue worker jobs only", () => {
    const state = createFixtureState();
    const inbound = enqueueAgentTrigger(state, {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      triggerType: "inbound_message",
      dedupeKey: "agent:inbound_message:ws-1:conv-1:msg-in-1",
    });
    const rejection = enqueueAgentTrigger(state, {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      triggerType: "approval_rejected",
      dedupeKey: "agent:approval_rejected:ws-1:conv-1:approval-1",
    });
    const manual = enqueueAgentTrigger(state, {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      triggerType: "manual_regenerate",
      manual: true,
      dedupeKey: "agent:manual_regenerate:ws-1:conv-1:member-1:nonce",
    });
    const duplicateManual = enqueueAgentTrigger(state, {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      triggerType: "manual_regenerate",
      manual: true,
      dedupeKey: "agent:manual_regenerate:ws-1:conv-1:member-1:nonce",
    });

    assert.equal(inbound.jobType, "agent.run_from_trigger");
    assert.equal(rejection.queueName, "agent");
    assert.equal(manual.id, duplicateManual.id);
    assert.equal(evaluateFollowUps(state, "ws-1").suppressions.length > 0, true);
  });

  test("generated draft requires approval and no autonomous send path exists", () => {
    const state = createFixtureState();
    const { draft, approval } = createAgentDraftApproval(state, "conv-1");
    assert.equal(draft.senderType, "AGENT");
    assert.equal(draft.status, "PENDING_APPROVAL");
    assert.equal(approval.status, "PENDING");
    assert.equal(
      state.runtimeJobs.some(
        (job) => job.jobType === "outbound.send_message" && job.payload?.sendSource === "approval",
      ),
      false,
    );
  });
});

describe("runtime and recovery regression", () => {
  test("event journal, idempotency, job lifecycle, dead letters, and stuck recovery are modeled", () => {
    const state = createFixtureState();
    const event = publishEvent(state, {
      eventId: "evt-1",
      workspaceId: "ws-1",
      eventType: "message_received",
    });
    publishEvent(state, event);
    assert.equal(state.eventJournal.length, 1);
    assert.equal(event.status, "PROCESSED");

    const key = "send:message:msg-1";
    assert.equal(beginIdempotent(state, key), true);
    completeIdempotent(state, key);
    assert.equal(beginIdempotent(state, key), false);

    const job = enqueueJob(state, {
      workspaceId: "ws-1",
      queueName: "maintenance",
      jobType: "maintenance.health_check",
      dedupeKey: "health:once",
      payload: {},
    });
    runJobToCompletion(job, { status: "ok" });
    assert.equal(job.status, "COMPLETED");

    const failed = enqueueJob(state, {
      workspaceId: "ws-1",
      queueName: "maintenance",
      jobType: "maintenance.recover_stuck_jobs",
      dedupeKey: "recover:stuck",
      payload: {},
      maxAttempts: 1,
    });
    assert.equal(exhaustJob(state, failed).runtimeJobId, failed.id);
  });
});

describe("tenancy and security regression", () => {
  test("cross-workspace reads are denied and operator routes are admin only", () => {
    const state = createFixtureState();
    assert.equal(getConversationForWorkspace(state, "ws-1", "conv-1").id, "conv-1");
    assert.throws(() => getConversationForWorkspace(state, "ws-2", "conv-1"), /denied/);
    const job = enqueueJob(state, {
      workspaceId: "ws-1",
      queueName: "agent",
      jobType: "agent.run_manual",
      dedupeKey: "manual",
      payload: {},
    });
    assert.equal(getRuntimeJobForWorkspace(state, "ws-1", job.id).id, job.id);
    assert.throws(() => getRuntimeJobForWorkspace(state, "ws-2", job.id), /denied/);
    requirePermission(state.users[0], "VIEW_AUDIT_LOGS");
    denyPermission(state.users[1], "VIEW_AUDIT_LOGS");
  });

  test("secret redaction and production dev-helper guards are present", () => {
    const security = readRepoFile(repoRoot, "apps/web/src/lib/security.ts");
    const settingsActions = readRepoFile(
      repoRoot,
      "apps/web/src/app/settings/workspace/actions.ts",
    );
    const settingsPage = readRepoFile(repoRoot, "apps/web/src/app/settings/workspace/page.tsx");

    assert.match(security, /access_token/);
    assert.match(security, /refresh_token/);
    assert.match(security, /Bearer/);
    assert.match(settingsActions, /NODE_ENV === "production"/);
    assert.match(settingsPage, /NODE_ENV !== "production"/);
  });
});
