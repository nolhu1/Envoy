import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const roles = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  VIEWER: "VIEWER",
};

export const permissionsByRole = {
  ADMIN: new Set([
    "VIEW_AUDIT_LOGS",
    "CONNECT_INTEGRATIONS",
    "SEND_MESSAGES",
    "APPROVE_DRAFTS",
    "ASSIGN_AGENTS",
  ]),
  MEMBER: new Set(["SEND_MESSAGES", "APPROVE_DRAFTS", "ASSIGN_AGENTS"]),
  VIEWER: new Set([]),
};

export function createFixtureState() {
  return {
    users: [
      { id: "admin-1", workspaceId: "ws-1", email: "admin@example.test", role: roles.ADMIN },
      { id: "member-1", workspaceId: "ws-1", email: "member@example.test", role: roles.MEMBER },
      { id: "viewer-1", workspaceId: "ws-1", email: "viewer@example.test", role: roles.VIEWER },
      { id: "admin-2", workspaceId: "ws-2", email: "other@example.test", role: roles.ADMIN },
    ],
    invites: [],
    integrations: [
      {
        id: "gmail-1",
        workspaceId: "ws-1",
        platform: "EMAIL",
        status: "CONNECTED",
        externalAccountId: "owner@example.test",
        historyPreserved: true,
        checkpoint: { hasMore: true, pages: 0, messagesInserted: 0 },
      },
    ],
    conversations: [
      {
        id: "conv-1",
        workspaceId: "ws-1",
        integrationId: "gmail-1",
        platform: "EMAIL",
        assignedAgentId: "assignment-1",
        state: "ACTIVE",
      },
      {
        id: "conv-2",
        workspaceId: "ws-2",
        integrationId: "gmail-2",
        platform: "EMAIL",
        assignedAgentId: null,
        state: "ACTIVE",
      },
      {
        id: "conv-follow",
        workspaceId: "ws-1",
        integrationId: "gmail-1",
        platform: "EMAIL",
        assignedAgentId: "assignment-1",
        state: "AWAITING_APPROVAL",
      },
    ],
    messages: [
      {
        id: "msg-in-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        direction: "INBOUND",
        senderType: "EXTERNAL",
        status: "RECEIVED",
        externalMessageId: "gmail-message-1",
      },
    ],
    approvals: [],
    eventJournal: [],
    idempotency: new Map(),
    runtimeJobs: [],
    deadLetters: [],
    actionLogs: [],
    attachments: [
      { id: "att-1", workspaceId: "ws-1", messageId: "msg-in-1", provider: "gmail" },
      { id: "att-2", workspaceId: "ws-2", messageId: "msg-other", provider: "gmail" },
    ],
  };
}

export function requirePermission(user, permission) {
  assert.equal(
    permissionsByRole[user.role]?.has(permission),
    true,
    `${user.role} should have ${permission}`,
  );
}

export function denyPermission(user, permission) {
  assert.equal(
    permissionsByRole[user.role]?.has(permission),
    false,
    `${user.role} should not have ${permission}`,
  );
}

export function createInvite(state, admin, email, role = roles.MEMBER) {
  requirePermission(admin, "VIEW_AUDIT_LOGS");
  const invite = {
    id: `invite-${state.invites.length + 1}`,
    workspaceId: admin.workspaceId,
    email,
    role,
    token: `token-${email}`,
    acceptedAt: null,
  };
  state.invites.push(invite);
  return invite;
}

export function acceptInvite(state, token, name = "Invited User") {
  const invite = state.invites.find((item) => item.token === token);
  assert.ok(invite, "invite exists");
  assert.equal(invite.acceptedAt, null, "invite is one-time");
  invite.acceptedAt = new Date().toISOString();
  const user = {
    id: `user-${state.users.length + 1}`,
    workspaceId: invite.workspaceId,
    email: invite.email,
    name,
    role: invite.role,
  };
  state.users.push(user);
  return user;
}

export function publishEvent(state, event) {
  if (state.eventJournal.some((row) => row.eventId === event.eventId)) {
    return state.eventJournal.find((row) => row.eventId === event.eventId);
  }

  const row = { ...event, status: "PROCESSED", attempts: ["action_log_projector"] };
  state.eventJournal.push(row);
  return row;
}

export function beginIdempotent(state, key) {
  if (state.idempotency.has(key)) {
    return false;
  }

  state.idempotency.set(key, { key, status: "STARTED" });
  return true;
}

export function completeIdempotent(state, key) {
  state.idempotency.set(key, { key, status: "COMPLETED" });
}

export function enqueueJob(state, input) {
  const existing = input.dedupeKey
    ? state.runtimeJobs.find(
        (job) => job.queueName === input.queueName && job.dedupeKey === input.dedupeKey,
      )
    : null;

  if (existing) {
    return existing;
  }

  const job = {
    id: `job-${state.runtimeJobs.length + 1}`,
    status: "QUEUED",
    attemptsMade: 0,
    maxAttempts: input.maxAttempts ?? 3,
    ...input,
  };
  state.runtimeJobs.push(job);
  return job;
}

export function runJobToCompletion(job, result = {}) {
  job.status = "COMPLETED";
  job.attemptsMade += 1;
  job.resultJson = { output: result };
  return job;
}

export function exhaustJob(state, job, reason = "exhausted failure") {
  job.status = "DEAD_LETTERED";
  job.attemptsMade = job.maxAttempts;
  const deadLetter = {
    id: `dlq-${state.deadLetters.length + 1}`,
    workspaceId: job.workspaceId,
    runtimeJobId: job.id,
    reason,
  };
  state.deadLetters.push(deadLetter);
  return deadLetter;
}

export function processProviderPage(state, integrationId, page) {
  const integration = state.integrations.find((item) => item.id === integrationId);
  assert.ok(integration, "integration exists");

  integration.checkpoint.pages += 1;
  integration.checkpoint.hasMore = Boolean(page.nextCursor);

  for (const message of page.messages) {
    const key = `${integration.platform}:${integration.id}:${message.externalMessageId}`;
    if (!beginIdempotent(state, key)) {
      continue;
    }
    state.messages.push({
      id: `msg-${state.messages.length + 1}`,
      workspaceId: integration.workspaceId,
      conversationId: message.conversationId,
      direction: "INBOUND",
      senderType: "EXTERNAL",
      status: "RECEIVED",
      externalMessageId: message.externalMessageId,
    });
    completeIdempotent(state, key);
    integration.checkpoint.messagesInserted += 1;
  }
}

export function createManualReply(state, user, conversationId) {
  requirePermission(user, "SEND_MESSAGES");
  const conversation = getConversationForWorkspace(state, user.workspaceId, conversationId);
  const message = {
    id: `msg-${state.messages.length + 1}`,
    workspaceId: user.workspaceId,
    conversationId,
    direction: "OUTBOUND",
    senderType: "USER",
    status: "QUEUED",
  };
  state.messages.push(message);
  return enqueueJob(state, {
    workspaceId: user.workspaceId,
    queueName: "outbound-send",
    jobType: "outbound.send_message",
    dedupeKey: `outbound-send:${user.workspaceId}:${message.id}:manual`,
    payload: { conversationId: conversation.id, messageId: message.id, sendSource: "manual" },
  });
}

export function createAgentDraftApproval(state, conversationId) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  assert.ok(conversation?.assignedAgentId, "active assignment required");
  const draft = {
    id: `msg-${state.messages.length + 1}`,
    workspaceId: conversation.workspaceId,
    conversationId,
    direction: "OUTBOUND",
    senderType: "AGENT",
    status: "PENDING_APPROVAL",
  };
  state.messages.push(draft);
  const approval = {
    id: `approval-${state.approvals.length + 1}`,
    workspaceId: conversation.workspaceId,
    conversationId,
    draftMessageId: draft.id,
    status: "PENDING",
  };
  state.approvals.push(approval);
  return { draft, approval };
}

export function approveDraft(state, user, approvalId, edited = false) {
  requirePermission(user, "APPROVE_DRAFTS");
  const approval = state.approvals.find((item) => item.id === approvalId);
  assert.ok(approval, "approval exists");
  approval.status = "APPROVED";
  approval.editedContent = edited ? "Edited approved content" : null;
  const draft = state.messages.find((message) => message.id === approval.draftMessageId);
  draft.status = "QUEUED";
  return enqueueJob(state, {
    workspaceId: approval.workspaceId,
    queueName: "outbound-send",
    jobType: "outbound.send_message",
    dedupeKey: `outbound-send:${approval.workspaceId}:${draft.id}:approval:${approval.id}`,
    payload: { messageId: draft.id, approvalRequestId: approval.id, sendSource: "approval" },
  });
}

export function rejectDraft(state, user, approvalId) {
  requirePermission(user, "APPROVE_DRAFTS");
  const approval = state.approvals.find((item) => item.id === approvalId);
  approval.status = "REJECTED";
  return state.runtimeJobs.filter((job) => job.payload?.approvalRequestId === approvalId);
}

export function enqueueAgentTrigger(state, input) {
  return enqueueJob(state, {
    workspaceId: input.workspaceId,
    queueName: "agent",
    jobType: input.manual ? "agent.run_manual" : "agent.run_from_trigger",
    dedupeKey: input.dedupeKey,
    payload: input,
    maxAttempts: 1,
  });
}

export function evaluateFollowUps(state, workspaceId) {
  const suppressions = [];
  for (const conversation of state.conversations.filter((item) => item.workspaceId === workspaceId)) {
    const pendingApproval = state.approvals.some(
      (approval) => approval.conversationId === conversation.id && approval.status === "PENDING",
    );
    if (!conversation.assignedAgentId || conversation.state === "AWAITING_APPROVAL" || pendingApproval) {
      suppressions.push({ conversationId: conversation.id, reason: "unresolved_approval_path" });
    }
  }
  return { suppressions, enqueued: 0 };
}

export function getConversationForWorkspace(state, workspaceId, conversationId) {
  const conversation = state.conversations.find(
    (item) => item.id === conversationId && item.workspaceId === workspaceId,
  );
  assert.ok(conversation, "cross-workspace conversation denied");
  return conversation;
}

export function getAttachmentForWorkspace(state, workspaceId, attachmentId) {
  const attachment = state.attachments.find(
    (item) => item.id === attachmentId && item.workspaceId === workspaceId,
  );
  assert.ok(attachment, "cross-workspace attachment denied");
  return attachment;
}

export function getRuntimeJobForWorkspace(state, workspaceId, runtimeJobId) {
  const job = state.runtimeJobs.find(
    (item) => item.id === runtimeJobId && item.workspaceId === workspaceId,
  );
  assert.ok(job, "cross-workspace runtime job denied");
  return job;
}

export function pubSubId(emailAddress, messageId) {
  return createHash("sha256").update(`${emailAddress}:${messageId}`).digest("hex");
}

export function readRepoFile(repoRoot, relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}
