import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Alert, Button, Panel } from "./primitives";
import { AgentStatus } from "./agent";
import { cn } from "./utils";

export type OperationStateProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  details?: ReactNode;
};

export function SyncErrorCard({
  title = "Sync failed",
  description = "The latest sync did not complete. Data may be stale until the source is synced again.",
  action,
  details,
  className,
  ...props
}: OperationStateProps) {
  return (
    <Alert
      severity="critical"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {details ? <div className="mt-2">{details}</div> : null}
    </Alert>
  );
}

export function ReconnectPrompt({
  title = "Reconnect required",
  description = "Reconnect this integration before reliable sync or send operations can continue.",
  action,
  details,
  className,
  ...props
}: OperationStateProps) {
  return (
    <Alert
      severity="warning"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {details ? <div className="mt-2">{details}</div> : null}
    </Alert>
  );
}

export function FailedSendState({
  title = "Send failed",
  description = "The outbound message was not sent. Review the diagnostics and retry when the issue is resolved.",
  action,
  details,
  className,
  ...props
}: OperationStateProps) {
  return (
    <Alert
      severity="critical"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {details ? <div className="mt-2">{details}</div> : null}
    </Alert>
  );
}

export function PendingApprovalState({
  title = "Pending approval",
  description = "A draft is waiting for human review before it can continue.",
  action,
  details,
  className,
  ...props
}: OperationStateProps) {
  return (
    <Alert
      severity="warning"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {details ? <div className="mt-2">{details}</div> : null}
    </Alert>
  );
}

export function EscalatedState({
  title = "Escalated",
  description = "This item needs operator attention before automation can continue.",
  action,
  details,
  className,
  ...props
}: OperationStateProps) {
  return (
    <Alert
      severity="warning"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {details ? <div className="mt-2">{details}</div> : null}
    </Alert>
  );
}

export type AgentStateProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  status:
    | "unassigned"
    | "assigned"
    | "running"
    | "completed"
    | "escalated"
    | "failed"
    | "disabled";
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function AgentState({
  status,
  title = "Agent status",
  description,
  action,
  className,
  ...props
}: AgentStateProps) {
  return (
    <Panel className={cn("space-y-3", className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          ) : null}
        </div>
        <AgentStatus status={status} />
      </div>
      {action ? <div>{action}</div> : null}
    </Panel>
  );
}

export type PermissionStateProps = OperationStateProps & {
  requiredPermission?: ReactNode;
  currentRole?: ReactNode;
};

export function PermissionState({
  title = "Permission required",
  description = "Your current role does not allow this action.",
  requiredPermission,
  currentRole,
  action,
  className,
  ...props
}: PermissionStateProps) {
  return (
    <Alert
      severity="neutral"
      title={title}
      actions={action}
      className={className}
      {...props}
    >
      <p>{description}</p>
      {requiredPermission || currentRole ? (
        <p className="mt-2 text-xs">
          {requiredPermission ? <>Required: {requiredPermission}. </> : null}
          {currentRole ? <>Current role: {currentRole}.</> : null}
        </p>
      ) : null}
    </Alert>
  );
}

export { Button };
