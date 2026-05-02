import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Alert, Panel, type AlertProps } from "./primitives";
import { cn } from "./utils";

export type TableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  mobileLabel?: ReactNode;
  sortable?: boolean;
};

export type TableProps<T> = ComponentPropsWithoutRef<"div"> & {
  columns: TableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  getRowHref?: (row: T) => string | undefined;
  rowActions?: (row: T) => ReactNode;
  emptyState?: ReactNode;
};

export function Table<T>({
  columns,
  rows,
  getRowId,
  getRowHref,
  rowActions,
  emptyState,
  className,
  ...props
}: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", className)}
      {...props}
    >
      <div
        className="hidden border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 md:grid"
        style={{
          gridTemplateColumns: `repeat(${columns.length + (rowActions ? 1 : 0)}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((column) => (
          <div key={column.id} className={cn("px-4 py-2", column.className)}>
            {column.header}
          </div>
        ))}
        {rowActions ? <div className="px-4 py-2 text-right">Actions</div> : null}
      </div>
      <div className="divide-y divide-slate-200">
        {rows.map((row) => (
          <TableRow
            key={getRowId(row)}
            href={getRowHref?.(row)}
            actions={rowActions?.(row)}
            columns={columns.map((column) => ({
              id: column.id,
              label: column.mobileLabel ?? column.header,
              value: column.cell(row),
              className: column.className,
            }))}
          />
        ))}
      </div>
    </div>
  );
}

export type TableRowCell = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

export type TableRowProps = {
  href?: string;
  columns: TableRowCell[];
  actions?: ReactNode;
};

export function TableRow({ href, columns, actions }: TableRowProps) {
  const content = (
    <>
      {columns.map((column) => (
        <div key={column.id} className={cn("min-w-0 px-4 py-3", column.className)}>
          <div className="mb-1 text-xs font-medium text-slate-500 md:hidden">
            {column.label}
          </div>
          <div className="text-sm text-slate-700">{column.value}</div>
        </div>
      ))}
      {actions ? (
        <div className="px-4 py-3 md:text-right" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      ) : null}
    </>
  );

  const className =
    "grid gap-1 transition-colors hover:bg-slate-50 md:gap-0 md:[grid-template-columns:inherit]";

  if (href) {
    return (
      <a href={href} className={cn(className, "block")}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

export type TableHeaderProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return (
    <div
      className={cn(
        "border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export type EmptyStateVariant =
  | "firstRun"
  | "filtered"
  | "noData"
  | "permission"
  | "disconnected"
  | "archived";

export type EmptyStateProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  variant?: EmptyStateVariant;
  title: ReactNode;
  description: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
};

export function EmptyState({
  className,
  title,
  description,
  primaryAction,
  secondaryAction,
  ...props
}: EmptyStateProps) {
  return (
    <section
      className={cn("rounded-lg border border-slate-200 bg-white p-6 text-sm", className)}
      {...props}
    >
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 max-w-2xl leading-5 text-slate-600">{description}</p>
      {primaryAction || secondaryAction ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}

export type LoadingSkeletonProps = ComponentPropsWithoutRef<"div"> & {
  variant?: "page" | "queue" | "detail" | "table" | "panel" | "text";
  rows?: number;
};

export function LoadingSkeleton({
  variant = "text",
  rows = 3,
  className,
  ...props
}: LoadingSkeletonProps) {
  if (variant === "queue" || variant === "table") {
    return (
      <div
        className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white", className)}
        {...props}
      >
        <div className="h-10 bg-slate-100" />
        <div className="divide-y divide-slate-200">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="grid gap-4 px-4 py-3 md:grid-cols-5">
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)} aria-busy="true" {...props}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-4 rounded bg-slate-100",
            variant === "panel" && "h-20",
            variant === "page" && index === 0 && "h-8 w-1/3",
            variant === "detail" && index === 0 && "h-32",
          )}
        />
      ))}
    </div>
  );
}

export type ErrorStateProps = Omit<AlertProps, "severity" | "title"> & {
  title?: ReactNode;
  retryAction?: ReactNode;
  detailsAction?: ReactNode;
};

export function ErrorState({
  title = "Something went wrong",
  retryAction,
  detailsAction,
  children,
  actions,
  ...props
}: ErrorStateProps) {
  return (
    <Alert
      severity="critical"
      title={title}
      actions={
        actions ?? (
          <>
            {retryAction}
            {detailsAction}
          </>
        )
      }
      {...props}
    >
      {children}
    </Alert>
  );
}

export type TimelineItemData = {
  id: string;
  timestamp: ReactNode;
  label: ReactNode;
  actor?: ReactNode;
  source?: ReactNode;
  severity?: "critical" | "warning" | "success" | "info" | "neutral";
  description?: ReactNode;
  relatedLinks?: ReactNode;
};

export type TimelineProps = ComponentPropsWithoutRef<"ol"> & {
  items: TimelineItemData[];
  emptyState?: ReactNode;
};

export function Timeline({ items, emptyState, className, ...props }: TimelineProps) {
  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <ol className={cn("space-y-3", className)} {...props}>
      {items.map((item) => (
        <TimelineItem key={item.id} {...item} />
      ))}
    </ol>
  );
}

export type TimelineItemProps = ComponentPropsWithoutRef<"li"> &
  Omit<TimelineItemData, "id">;

export function TimelineItem({
  timestamp,
  label,
  actor,
  source,
  severity = "neutral",
  description,
  relatedLinks,
  className,
  ...props
}: TimelineItemProps) {
  const tone =
    severity === "critical"
      ? "border-l-red-400"
      : severity === "warning"
        ? "border-l-amber-300"
        : severity === "success"
          ? "border-l-emerald-300"
          : severity === "info"
            ? "border-l-sky-300"
            : "border-l-slate-300";

  return (
    <li
      className={cn("rounded-lg border border-slate-200 border-l-4 bg-white p-4", tone, className)}
      {...props}
    >
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          {actor || source ? (
            <p className="mt-1 text-xs text-slate-500">
              {[actor, source].filter(Boolean).map((part, index) => (
                <span key={index}>
                  {index > 0 ? " · " : null}
                  {part}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{timestamp}</p>
      </div>
      {description ? (
        <div className="mt-2 text-sm leading-5 text-slate-700">{description}</div>
      ) : null}
      {relatedLinks ? <div className="mt-3 flex flex-wrap gap-2">{relatedLinks}</div> : null}
    </li>
  );
}

export { Panel };
