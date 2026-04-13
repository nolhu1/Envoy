export const CONVERSATION_STATES = {
  UNASSIGNED: "UNASSIGNED",
  ACTIVE: "ACTIVE",
  WAITING: "WAITING",
  FOLLOW_UP_DUE: "FOLLOW_UP_DUE",
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  ESCALATED: "ESCALATED",
  COMPLETED: "COMPLETED",
  CLOSED: "CLOSED",
} as const;

export type ConversationState =
  (typeof CONVERSATION_STATES)[keyof typeof CONVERSATION_STATES];

export const CONVERSATION_WORKFLOW_TRIGGER_TYPES = {
  MESSAGE_RECEIVED: "message_received",
  MESSAGE_SENT: "message_sent",
  FOLLOW_UP_TIMER_ELAPSED: "follow_up_timer_elapsed",
  APPROVAL_REQUIRED: "approval_required",
  APPROVAL_RESOLVED: "approval_resolved",
  ESCALATION_REQUESTED: "escalation_requested",
  MANUAL_UPDATE: "manual_update",
  COMPLETED: "completed",
  CLOSED: "closed",
  REOPENED: "reopened",
} as const;

export type ConversationWorkflowTriggerType =
  (typeof CONVERSATION_WORKFLOW_TRIGGER_TYPES)[keyof typeof CONVERSATION_WORKFLOW_TRIGGER_TYPES];

export type ConversationWorkflowEvent = {
  triggerType: ConversationWorkflowTriggerType;
  occurredAt?: string | Date | null;
  eventId?: string | null;
  eventType?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ConversationStateTransitionInput = {
  conversationId?: string | null;
  from: ConversationState;
  to: ConversationState;
  event: ConversationWorkflowEvent;
  reason?: string | null;
};

export type ConversationStateTransition = {
  conversationId?: string | null;
  from: ConversationState;
  to: ConversationState;
  changed: boolean;
  reason?: string | null;
  transitionKey: `${ConversationState}->${ConversationState}`;
  allowedNextStates: readonly ConversationState[];
  event: Required<
    Pick<ConversationWorkflowEvent, "triggerType" | "occurredAt">
  > &
    Omit<ConversationWorkflowEvent, "triggerType" | "occurredAt">;
};

export class ConversationStateTransitionError extends Error {
  readonly from: ConversationState;
  readonly to: ConversationState;
  readonly allowedNextStates: readonly ConversationState[];
  readonly event: ConversationWorkflowEvent;
  readonly conversationId?: string | null;

  constructor(input: {
    from: ConversationState;
    to: ConversationState;
    allowedNextStates: readonly ConversationState[];
    event: ConversationWorkflowEvent;
    conversationId?: string | null;
  }) {
    super(
      [
        `Invalid conversation state transition ${input.from} -> ${input.to}.`,
        `Allowed next states: ${input.allowedNextStates.join(", ") || "none"}.`,
      ].join(" "),
    );
    this.name = "ConversationStateTransitionError";
    this.from = input.from;
    this.to = input.to;
    this.allowedNextStates = input.allowedNextStates;
    this.event = input.event;
    this.conversationId = input.conversationId ?? null;
  }
}

export const ALLOWED_CONVERSATION_STATE_TRANSITIONS: Readonly<
  Record<ConversationState, readonly ConversationState[]>
> = {
  UNASSIGNED: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.WAITING,
    CONVERSATION_STATES.FOLLOW_UP_DUE,
    CONVERSATION_STATES.AWAITING_APPROVAL,
    CONVERSATION_STATES.ESCALATED,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  ACTIVE: [
    CONVERSATION_STATES.UNASSIGNED,
    CONVERSATION_STATES.WAITING,
    CONVERSATION_STATES.FOLLOW_UP_DUE,
    CONVERSATION_STATES.AWAITING_APPROVAL,
    CONVERSATION_STATES.ESCALATED,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  WAITING: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.FOLLOW_UP_DUE,
    CONVERSATION_STATES.AWAITING_APPROVAL,
    CONVERSATION_STATES.ESCALATED,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  FOLLOW_UP_DUE: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.WAITING,
    CONVERSATION_STATES.AWAITING_APPROVAL,
    CONVERSATION_STATES.ESCALATED,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  AWAITING_APPROVAL: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.WAITING,
    CONVERSATION_STATES.ESCALATED,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  ESCALATED: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.WAITING,
    CONVERSATION_STATES.FOLLOW_UP_DUE,
    CONVERSATION_STATES.AWAITING_APPROVAL,
    CONVERSATION_STATES.COMPLETED,
    CONVERSATION_STATES.CLOSED,
  ],
  COMPLETED: [
    CONVERSATION_STATES.ACTIVE,
    CONVERSATION_STATES.CLOSED,
  ],
  CLOSED: [CONVERSATION_STATES.ACTIVE],
} as const;

export function getAllowedConversationStateTransitions(
  state: ConversationState,
) {
  return ALLOWED_CONVERSATION_STATE_TRANSITIONS[state];
}

export function isTerminalConversationState(state: ConversationState) {
  return (
    state === CONVERSATION_STATES.COMPLETED ||
    state === CONVERSATION_STATES.CLOSED
  );
}

export function isValidConversationStateTransition(
  from: ConversationState,
  to: ConversationState,
) {
  if (from === to) {
    return true;
  }

  return getAllowedConversationStateTransitions(from).includes(to);
}

export function assertValidConversationStateTransition(
  from: ConversationState,
  to: ConversationState,
  event: ConversationWorkflowEvent = {
    triggerType: CONVERSATION_WORKFLOW_TRIGGER_TYPES.MANUAL_UPDATE,
  },
  conversationId?: string | null,
) {
  if (isValidConversationStateTransition(from, to)) {
    return;
  }

  throw new ConversationStateTransitionError({
    from,
    to,
    allowedNextStates: getAllowedConversationStateTransitions(from),
    event,
    conversationId,
  });
}

export function transitionConversationState(
  input: ConversationStateTransitionInput,
): ConversationStateTransition {
  assertValidConversationStateTransition(
    input.from,
    input.to,
    input.event,
    input.conversationId,
  );

  return {
    conversationId: input.conversationId ?? null,
    from: input.from,
    to: input.to,
    changed: input.from !== input.to,
    reason: input.reason ?? null,
    transitionKey: `${input.from}->${input.to}`,
    allowedNextStates: getAllowedConversationStateTransitions(input.from),
    event: {
      ...input.event,
      occurredAt: normalizeWorkflowOccurredAt(input.event.occurredAt),
      eventId: input.event.eventId ?? null,
      eventType: input.event.eventType ?? null,
      source: input.event.source ?? null,
      metadata: input.event.metadata ?? null,
    },
  };
}

function normalizeWorkflowOccurredAt(value?: string | Date | null) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : value;
}
