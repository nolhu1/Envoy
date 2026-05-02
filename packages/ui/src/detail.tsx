import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button, Panel } from "./primitives";
import { SplitLayout } from "./layout";
import { Timeline, TimelineItem, type TimelineItemData } from "./data-display";
import { cn } from "./utils";

export type DetailLayoutProps = ComponentPropsWithoutRef<"section"> & {
  header?: ReactNode;
  primary: ReactNode;
  actionRail?: ReactNode;
  metadata?: ReactNode;
  timeline?: ReactNode;
  statusRegion?: ReactNode;
};

export function DetailLayout({
  header,
  primary,
  actionRail,
  metadata,
  timeline,
  statusRegion,
  className,
  ...props
}: DetailLayoutProps) {
  return (
    <section className={cn("space-y-6", className)} {...props}>
      {header}
      {statusRegion}
      <SplitLayout
        primary={primary}
        rail={
          actionRail || metadata ? (
            <div className="space-y-4">
              {actionRail}
              {metadata}
            </div>
          ) : null
        }
        timeline={timeline}
      />
    </section>
  );
}

export type ActionRailProps = Omit<ComponentPropsWithoutRef<"aside">, "title"> & {
  title?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  dangerActions?: ReactNode;
  status?: ReactNode;
};

export function ActionRail({
  title = "Actions",
  primaryAction,
  secondaryActions,
  dangerActions,
  status,
  children,
  className,
  ...props
}: ActionRailProps) {
  return (
    <aside className={cn("rounded-lg border border-slate-200 bg-white p-4", className)} {...props}>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {status ? <div className="mt-3">{status}</div> : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {primaryAction ? <div className="mt-4">{primaryAction}</div> : null}
      {secondaryActions ? <div className="mt-3 grid gap-2">{secondaryActions}</div> : null}
      {dangerActions ? (
        <div className="mt-4 border-t border-slate-200 pt-4">{dangerActions}</div>
      ) : null}
    </aside>
  );
}

export type MetadataItem = {
  label: ReactNode;
  value: ReactNode;
  copyValue?: string;
  href?: string;
};

export type MetadataListProps = ComponentPropsWithoutRef<"dl"> & {
  items: MetadataItem[];
};

export function MetadataList({ items, className, ...props }: MetadataListProps) {
  return (
    <dl className={cn("divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white", className)} {...props}>
      {items.map((item, index) => (
        <div key={index} className="grid gap-1 px-4 py-3">
          <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
          <dd className="min-w-0 text-sm text-slate-800">
            {item.copyValue ? (
              <CopyableField value={item.copyValue} label={item.value} />
            ) : item.href ? (
              <a href={item.href} className="font-medium text-slate-950 underline">
                {item.value}
              </a>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type CopyableFieldProps = ComponentPropsWithoutRef<"span"> & {
  value: string;
  label?: ReactNode;
  truncate?: boolean;
};

export function CopyableField({
  value,
  label,
  truncate = true,
  className,
  ...props
}: CopyableFieldProps) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2", className)} {...props}>
      <code className={cn("font-mono text-xs text-slate-700", truncate && "truncate")}>
        {label ?? value}
      </code>
      <button
        type="button"
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
        data-copy-value={value}
      >
        Copy
      </button>
    </span>
  );
}

export type ActionGroupProps = ComponentPropsWithoutRef<"div"> & {
  orientation?: "horizontal" | "vertical";
  tone?: "default" | "danger";
};

export function ActionGroup({
  orientation = "horizontal",
  tone = "default",
  className,
  ...props
}: ActionGroupProps) {
  return (
    <div
      className={cn(
        orientation === "vertical" ? "grid gap-2" : "flex flex-wrap gap-2",
        tone === "danger" && "border-t border-slate-200 pt-4",
        className,
      )}
      {...props}
    />
  );
}

export type DecisionPanelProps = ComponentPropsWithoutRef<"section"> & {
  status: ReactNode;
  draft: ReactNode;
  approveAction?: ReactNode;
  editApproveAction?: ReactNode;
  rejectAction?: ReactNode;
  reviewOutcome?: ReactNode;
};

export function DecisionPanel({
  status,
  draft,
  approveAction,
  editApproveAction,
  rejectAction,
  reviewOutcome,
  className,
  ...props
}: DecisionPanelProps) {
  return (
    <Panel className={className} {...props}>
      <div className="flex flex-col gap-4">
        <div>{status}</div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">{draft}</div>
        {reviewOutcome}
        <ActionGroup>
          {approveAction}
          {editApproveAction}
        </ActionGroup>
        {rejectAction ? <ActionGroup tone="danger">{rejectAction}</ActionGroup> : null}
      </div>
    </Panel>
  );
}

export type Message = {
  id: string;
  sender: ReactNode;
  direction: "inbound" | "outbound" | "internal" | "system";
  status: ReactNode;
  timestamp: ReactNode;
  body: ReactNode;
  attachments?: ReactNode;
  metadata?: ReactNode;
  failed?: boolean;
};

export type MessageListProps = ComponentPropsWithoutRef<"div"> & {
  messages: Message[];
  emptyState?: ReactNode;
};

export function MessageList({
  messages,
  emptyState,
  className,
  ...props
}: MessageListProps) {
  if (messages.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("space-y-3", className)} {...props}>
      {messages.map((message) => (
        <MessageItem key={message.id} {...message} />
      ))}
    </div>
  );
}

export type MessageItemProps = ComponentPropsWithoutRef<"article"> & Message;

export function MessageItem({
  sender,
  direction,
  status,
  timestamp,
  body,
  attachments,
  metadata,
  failed,
  className,
  ...props
}: MessageItemProps) {
  const marker = failed
    ? "border-l-red-400 bg-red-50/40"
    : direction === "outbound"
      ? "border-l-sky-300"
      : direction === "internal" || direction === "system"
        ? "border-l-amber-300"
        : "border-l-slate-300";

  return (
    <article
      className={cn("rounded-lg border border-l-4 border-slate-200 bg-white p-4", marker, className)}
      {...props}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{sender}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{direction}</span>
            <span>{status}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">{timestamp}</p>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{body}</div>
      {attachments ? <div className="mt-3">{attachments}</div> : null}
      {metadata ? <div className="mt-3 text-xs text-slate-500">{metadata}</div> : null}
    </article>
  );
}

export type AttachmentItemProps = ComponentPropsWithoutRef<"div"> & {
  fileName: ReactNode;
  mimeType?: ReactNode;
  sizeLabel?: ReactNode;
  href?: string;
  actions?: ReactNode;
};

export function AttachmentItem({
  fileName,
  mimeType,
  sizeLabel,
  href,
  actions,
  className,
  ...props
}: AttachmentItemProps) {
  const name = href ? (
    <a href={href} className="font-medium text-slate-950 underline">
      {fileName}
    </a>
  ) : (
    <span className="font-medium text-slate-950">{fileName}</span>
  );

  return (
    <div
      className={cn("flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2", className)}
      {...props}
    >
      <div className="min-w-0">
        <p className="truncate text-sm">{name}</p>
        {mimeType || sizeLabel ? (
          <p className="mt-1 text-xs text-slate-500">
            {[mimeType, sizeLabel].filter(Boolean).map((part, index) => (
              <span key={index}>
                {index > 0 ? " · " : null}
                {part}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

export { Button, Timeline, TimelineItem };
export type { TimelineItemData };
