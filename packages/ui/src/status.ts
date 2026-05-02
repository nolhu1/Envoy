import type { Severity } from "./tokens";

export type StatusDomain =
  | "conversation"
  | "approval"
  | "integration"
  | "message"
  | "assignment"
  | "agentRun"
  | "severity";

export type BadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "platform";

export type StatusDefinition = {
  label: string;
  badgeVariant: BadgeVariant;
  severity: Severity;
  description?: string;
  requiresAction?: boolean;
};

export const statusMappings = {
  conversation: {
    UNASSIGNED: {
      label: "Unassigned",
      badgeVariant: "neutral",
      severity: "neutral",
    },
    ACTIVE: { label: "Active", badgeVariant: "info", severity: "info" },
    WAITING: { label: "Waiting", badgeVariant: "neutral", severity: "neutral" },
    FOLLOW_UP_DUE: {
      label: "Follow-up due",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    AWAITING_APPROVAL: {
      label: "Awaiting approval",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    ESCALATED: {
      label: "Escalated",
      badgeVariant: "critical",
      severity: "warning",
      requiresAction: true,
    },
    COMPLETED: {
      label: "Completed",
      badgeVariant: "success",
      severity: "success",
    },
    CLOSED: { label: "Closed", badgeVariant: "neutral", severity: "neutral" },
  },
  approval: {
    PENDING: {
      label: "Pending review",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    APPROVED: {
      label: "Approved",
      badgeVariant: "success",
      severity: "success",
    },
    REJECTED: {
      label: "Rejected",
      badgeVariant: "critical",
      severity: "warning",
      requiresAction: true,
    },
    CANCELLED: {
      label: "Cancelled",
      badgeVariant: "neutral",
      severity: "neutral",
    },
  },
  integration: {
    CONNECTED: {
      label: "Connected",
      badgeVariant: "success",
      severity: "success",
    },
    PENDING: {
      label: "Pending setup",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    SYNC_IN_PROGRESS: {
      label: "Syncing",
      badgeVariant: "info",
      severity: "info",
    },
    ERROR: {
      label: "Error",
      badgeVariant: "critical",
      severity: "critical",
      requiresAction: true,
    },
    DISCONNECTED: {
      label: "Disconnected",
      badgeVariant: "neutral",
      severity: "neutral",
    },
  },
  message: {
    RECEIVED: { label: "Received", badgeVariant: "neutral", severity: "neutral" },
    DRAFT: { label: "Draft", badgeVariant: "neutral", severity: "neutral" },
    PENDING_APPROVAL: {
      label: "Pending approval",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    APPROVED: {
      label: "Approved",
      badgeVariant: "success",
      severity: "success",
    },
    REJECTED: {
      label: "Rejected",
      badgeVariant: "critical",
      severity: "warning",
      requiresAction: true,
    },
    QUEUED: { label: "Queued", badgeVariant: "info", severity: "info" },
    SENT: { label: "Sent", badgeVariant: "success", severity: "success" },
    DELIVERED: {
      label: "Delivered",
      badgeVariant: "success",
      severity: "success",
    },
    FAILED: {
      label: "Failed",
      badgeVariant: "critical",
      severity: "critical",
      requiresAction: true,
    },
  },
  assignment: {
    assigned: { label: "Assigned", badgeVariant: "info", severity: "info" },
    unassigned: {
      label: "Unassigned",
      badgeVariant: "neutral",
      severity: "neutral",
    },
    disabled: {
      label: "Disabled",
      badgeVariant: "neutral",
      severity: "warning",
    },
  },
  agentRun: {
    running: { label: "Running", badgeVariant: "info", severity: "info" },
    completed: {
      label: "Completed",
      badgeVariant: "success",
      severity: "success",
    },
    createdDraft: {
      label: "Draft created",
      badgeVariant: "success",
      severity: "success",
    },
    escalated: {
      label: "Escalated",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    failed: {
      label: "Failed",
      badgeVariant: "critical",
      severity: "critical",
      requiresAction: true,
    },
  },
  severity: {
    critical: {
      label: "Critical",
      badgeVariant: "critical",
      severity: "critical",
      requiresAction: true,
    },
    warning: {
      label: "Warning",
      badgeVariant: "warning",
      severity: "warning",
      requiresAction: true,
    },
    success: { label: "Success", badgeVariant: "success", severity: "success" },
    info: { label: "Info", badgeVariant: "info", severity: "info" },
    neutral: { label: "Neutral", badgeVariant: "neutral", severity: "neutral" },
  },
} satisfies Record<StatusDomain, Record<string, StatusDefinition>>;

export function getStatusDefinition(
  domain: StatusDomain,
  status: string,
): StatusDefinition {
  const domainMappings = statusMappings[domain] as Record<string, StatusDefinition>;

  return (
    domainMappings[status] ?? {
      label: formatStatusLabel(status),
      badgeVariant: "neutral",
      severity: "neutral",
    }
  );
}

export function formatStatusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}
