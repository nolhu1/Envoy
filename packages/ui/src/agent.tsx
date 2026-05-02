import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button, Checkbox, Panel } from "./primitives";
import { Badge, StatusBadge } from "./primitives";
import { cn } from "./utils";

export type AgentSummaryProps = ComponentPropsWithoutRef<"section"> & {
  assigned: boolean;
  goal?: ReactNode;
  instructions?: ReactNode;
  tone?: ReactNode;
  triggerRules?: ReactNode;
  lastRun?: ReactNode;
};

export function AgentSummary({
  assigned,
  goal,
  instructions,
  tone,
  triggerRules,
  lastRun,
  className,
  ...props
}: AgentSummaryProps) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white p-4", className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">Agent assignment</h2>
        <Badge variant={assigned ? "info" : "neutral"}>
          {assigned ? "Assigned" : "Unassigned"}
        </Badge>
      </div>
      {assigned ? (
        <div className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
          {goal ? (
            <p>
              <span className="font-medium text-slate-950">Goal:</span> {goal}
            </p>
          ) : null}
          {instructions ? (
            <p>
              <span className="font-medium text-slate-950">Instructions:</span>{" "}
              {instructions}
            </p>
          ) : null}
          {tone ? (
            <p>
              <span className="font-medium text-slate-950">Tone:</span> {tone}
            </p>
          ) : null}
          {triggerRules ? (
            <div className="space-y-1">
              <div className="font-medium text-slate-950">Trigger rules:</div>
              {triggerRules}
            </div>
          ) : null}
          {lastRun ? (
            <p>
              <span className="font-medium text-slate-950">Last run:</span> {lastRun}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No active assignment.</p>
      )}
    </section>
  );
}

export type AgentControlPanelProps = ComponentPropsWithoutRef<"section"> & {
  summary: ReactNode;
  status?: ReactNode;
  editForm?: ReactNode;
  actions?: ReactNode;
  dangerActions?: ReactNode;
};

export function AgentControlPanel({
  summary,
  status,
  editForm,
  actions,
  dangerActions,
  className,
  ...props
}: AgentControlPanelProps) {
  return (
    <Panel className={cn("space-y-4", className)} {...props}>
      {summary}
      {status}
      {editForm}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      {dangerActions ? (
        <div className="border-t border-slate-200 pt-4">{dangerActions}</div>
      ) : null}
    </Panel>
  );
}

export type AgentStatusProps = ComponentPropsWithoutRef<"span"> & {
  status:
    | "unassigned"
    | "assigned"
    | "running"
    | "completed"
    | "escalated"
    | "failed"
    | "disabled";
  lastRunAt?: ReactNode;
  message?: ReactNode;
};

export function AgentStatus({
  status,
  lastRunAt,
  message,
  className,
  ...props
}: AgentStatusProps) {
  const mappedStatus =
    status === "assigned"
      ? "assigned"
      : status === "unassigned"
        ? "unassigned"
        : status === "disabled"
          ? "disabled"
          : status;

  return (
    <span className={cn("inline-flex items-center gap-2", className)} {...props}>
      {status === "assigned" || status === "unassigned" || status === "disabled" ? (
        <StatusBadge domain="assignment" status={mappedStatus} />
      ) : (
        <StatusBadge domain="agentRun" status={mappedStatus} />
      )}
      {lastRunAt ? <span className="text-xs text-slate-500">{lastRunAt}</span> : null}
      {message ? <span className="text-xs text-slate-500">{message}</span> : null}
    </span>
  );
}

export type AgentRunButtonProps = ComponentPropsWithoutRef<"button"> & {
  disabledReason?: ReactNode;
  loading?: boolean;
};

export function AgentRunButton({
  disabledReason,
  loading,
  disabled,
  children = "Run agent",
  ...props
}: AgentRunButtonProps) {
  return (
    <div className="grid gap-1">
      <Button
        type="button"
        variant="accent"
        loading={loading}
        disabled={disabled || Boolean(disabledReason)}
        {...props}
      >
        {loading ? "Running..." : children}
      </Button>
      {disabledReason ? (
        <p className="text-xs leading-5 text-slate-500">{disabledReason}</p>
      ) : null}
    </div>
  );
}

export type TriggerRule = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
};

export type TriggerRuleListProps = ComponentPropsWithoutRef<"div"> & {
  rules: TriggerRule[];
  mode?: "read" | "edit";
};

export function TriggerRuleList({
  rules,
  mode = "read",
  className,
  ...props
}: TriggerRuleListProps) {
  if (mode === "read") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)} {...props}>
        {rules.length === 0 ? (
          <Badge variant="neutral">No triggers enabled</Badge>
        ) : (
          rules.map((rule) => (
            <Badge key={rule.value} variant={rule.checked === false ? "neutral" : "info"}>
              {rule.label}
            </Badge>
          ))
        )}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      {rules.map((rule) => (
        <Checkbox
          key={rule.value}
          name="enabledTriggerTypes"
          value={rule.value}
          label={rule.label}
          description={rule.description}
          defaultChecked={rule.checked}
          disabled={rule.disabled}
        />
      ))}
    </div>
  );
}
