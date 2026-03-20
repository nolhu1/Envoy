export const INTEGRATION_STATUSES = {
  PENDING: "PENDING",
  CONNECTED: "CONNECTED",
  SYNC_IN_PROGRESS: "SYNC_IN_PROGRESS",
  ERROR: "ERROR",
  DISCONNECTED: "DISCONNECTED",
} as const;

export type IntegrationStatus =
  (typeof INTEGRATION_STATUSES)[keyof typeof INTEGRATION_STATUSES];

export const INTEGRATION_STATUS_TRANSITIONS: Record<
  IntegrationStatus,
  readonly IntegrationStatus[]
> = {
  PENDING: [INTEGRATION_STATUSES.CONNECTED, INTEGRATION_STATUSES.ERROR],
  CONNECTED: [
    INTEGRATION_STATUSES.SYNC_IN_PROGRESS,
    INTEGRATION_STATUSES.ERROR,
    INTEGRATION_STATUSES.DISCONNECTED,
  ],
  SYNC_IN_PROGRESS: [
    INTEGRATION_STATUSES.CONNECTED,
    INTEGRATION_STATUSES.ERROR,
    INTEGRATION_STATUSES.DISCONNECTED,
  ],
  ERROR: [INTEGRATION_STATUSES.CONNECTED, INTEGRATION_STATUSES.DISCONNECTED],
  DISCONNECTED: [
    INTEGRATION_STATUSES.PENDING,
    INTEGRATION_STATUSES.CONNECTED,
  ],
};

export function isValidIntegrationStatusTransition(
  from: IntegrationStatus,
  to: IntegrationStatus,
) {
  return INTEGRATION_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidIntegrationStatusTransition(
  from: IntegrationStatus,
  to: IntegrationStatus,
) {
  if (!isValidIntegrationStatusTransition(from, to)) {
    throw new Error(
      `Invalid integration status transition: ${from} -> ${to}`,
    );
  }
}

export function canIntegrationSync(status: IntegrationStatus) {
  return (
    status === INTEGRATION_STATUSES.CONNECTED ||
    status === INTEGRATION_STATUSES.SYNC_IN_PROGRESS
  );
}

export function canIntegrationSend(status: IntegrationStatus) {
  return (
    status === INTEGRATION_STATUSES.CONNECTED ||
    status === INTEGRATION_STATUSES.SYNC_IN_PROGRESS
  );
}

export function canIntegrationProcessWebhooks(status: IntegrationStatus) {
  return (
    status === INTEGRATION_STATUSES.CONNECTED ||
    status === INTEGRATION_STATUSES.SYNC_IN_PROGRESS
  );
}
