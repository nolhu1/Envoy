import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import {
  EmptyState,
  LoadingSkeleton,
  type EmptyStateProps,
  type TableColumn,
} from "./data-display";
import { Button, Panel } from "./primitives";
import { cn } from "./utils";

export type QueueState = "loading" | "empty" | "error" | "ready";

export type QueueContainerProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  filters?: ReactNode;
  activeFilters?: ReactNode;
  actions?: ReactNode;
  state?: QueueState;
};

export function QueueContainer({
  title,
  description,
  filters,
  activeFilters,
  actions,
  state = "ready",
  children,
  className,
  ...props
}: QueueContainerProps) {
  return (
    <section className={cn("space-y-4", className)} data-state={state} {...props}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {filters}
      {activeFilters}
      {children}
    </section>
  );
}

export type FilterBarProps = ComponentPropsWithoutRef<"form"> & {
  resetHref?: string;
  mobileMode?: "drawer" | "stack";
  actions?: ReactNode;
};

export function FilterBar({
  resetHref,
  mobileMode = "stack",
  actions,
  children,
  className,
  ...props
}: FilterBarProps) {
  const formContent = (
    <>
      {children}
      <div className="flex items-end gap-2">
        {actions ?? (
          <>
            <Button type="submit" size="sm">
              Apply
            </Button>
            {resetHref ? (
              <a
                href={resetHref}
                className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Reset
              </a>
            ) : null}
          </>
        )}
      </div>
    </>
  );

  if (mobileMode === "drawer") {
    return (
      <>
        <details className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-950/5 sm:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-slate-950 marker:text-slate-400">
            Filters
          </summary>
          <form className={cn("mt-3 grid gap-3", className)} {...props}>
            {formContent}
          </form>
        </details>
        <form
            className={cn(
            "hidden gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]",
            className,
          )}
          {...props}
        >
          {formContent}
        </form>
      </>
    );
  }

  return (
    <form
      className={cn(
        "grid gap-3 rounded-lg border border-slate-200 bg-white p-4",
        "shadow-sm shadow-slate-950/5",
        mobileMode === "stack" && "sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]",
        className,
      )}
      {...props}
    >
      {formContent}
    </form>
  );
}

export type FilterFieldProps = ComponentPropsWithoutRef<"label"> & {
  label: ReactNode;
  name?: string;
};

export function FilterField({
  label,
  children,
  className,
  ...props
}: FilterFieldProps) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)} {...props}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export type ActiveFilter = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  removeHref?: string;
};

export type ActiveFiltersProps = ComponentPropsWithoutRef<"div"> & {
  filters: ActiveFilter[];
  clearHref?: string;
};

export function ActiveFilters({
  filters,
  clearHref,
  className,
  ...props
}: ActiveFiltersProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props}>
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
        >
          <span className="font-medium">{filter.label}:</span>
          <span>{filter.value}</span>
          {filter.removeHref ? (
            <a href={filter.removeHref} aria-label={`Remove ${filter.label} filter`}>
              ×
            </a>
          ) : null}
        </span>
      ))}
      {clearHref ? (
        <a href={clearHref} className="text-xs font-medium text-slate-600 underline">
          Clear all
        </a>
      ) : null}
    </div>
  );
}

export type QueueColumn<T> = TableColumn<T> & {
  required?: boolean;
};

export type QueueTableProps<T> = ComponentPropsWithoutRef<"div"> & {
  columns: QueueColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  getRowHref?: (row: T) => string | undefined;
  renderRowActions?: (row: T) => ReactNode;
  emptyState?: ReactNode;
  gridTemplateColumns?: string;
};

export function QueueTable<T>({
  columns,
  rows,
  getRowId,
  getRowHref,
  renderRowActions,
  emptyState,
  gridTemplateColumns,
  className,
  ...props
}: QueueTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const template =
    gridTemplateColumns ??
    `repeat(${columns.length + (renderRowActions ? 1 : 0)}, minmax(0, 1fr))`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/5",
        className,
      )}
      {...props}
    >
      <div
        className="hidden border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500 sm:grid"
        style={{
          gridTemplateColumns: template,
        }}
      >
        {columns.map((column) => (
          <div key={column.id} className={cn("px-4 py-2", column.className)}>
            {column.header}
          </div>
        ))}
        {renderRowActions ? <div className="px-4 py-2 text-right">Actions</div> : null}
      </div>
      {rows.map((row) => (
        <QueueRow
          key={getRowId(row)}
          href={getRowHref?.(row)}
          cells={columns.map((column) => ({
            id: column.id,
            label: column.mobileLabel ?? column.header,
            value: column.cell(row),
            className: column.className,
          }))}
          actions={renderRowActions?.(row)}
          gridTemplateColumns={template}
        />
      ))}
    </div>
  );
}

export type QueueRowCell = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

export type QueueRowProps = {
  href?: string;
  cells: QueueRowCell[];
  actions?: ReactNode;
  gridTemplateColumns?: string;
};

export function QueueRow({
  href,
  cells,
  actions,
  gridTemplateColumns,
}: QueueRowProps) {
  const className = cn(
    "relative grid border-t border-slate-200 transition-colors hover:bg-slate-50/80",
    href && "cursor-pointer",
  );
  const style = gridTemplateColumns
    ? ({ "--queue-grid-template": gridTemplateColumns } as CSSProperties)
    : undefined;

  return (
    <div
      className={cn(
        className,
        "sm:[grid-template-columns:var(--queue-grid-template)]",
      )}
      style={style}
    >
      {href ? (
        <a
          href={href}
          aria-label="Open row"
          className="absolute inset-0 z-10"
        />
      ) : null}
      {cells.map((cell) => (
        <div
          key={cell.id}
          className={cn(
            "relative z-0 min-w-0 px-4 py-3.5",
            href && "pointer-events-none",
            cell.className,
          )}
        >
          <div className="mb-1 text-xs font-medium text-slate-500 sm:hidden">
            {cell.label}
          </div>
          <div className="text-sm leading-5 text-slate-700">{cell.value}</div>
        </div>
      ))}
      {actions ? (
        <div className="relative z-20 px-4 py-3.5 sm:text-right">{actions}</div>
      ) : null}
    </div>
  );
}

export type QueuePaginationProps = ComponentPropsWithoutRef<"nav"> & {
  page: number;
  pageSize: number;
  totalCount?: number;
  nextHref?: string;
  previousHref?: string;
  resultLabel?: ReactNode;
};

export function QueuePagination({
  page,
  pageSize,
  totalCount,
  nextHref,
  previousHref,
  resultLabel,
  className,
  ...props
}: QueuePaginationProps) {
  const fallbackLabel =
    totalCount == null
      ? `Page ${page} · ${pageSize} per page`
      : `Page ${page} · ${totalCount} total`;

  return (
    <nav
      className={cn("flex items-center justify-between gap-3 text-sm text-slate-600", className)}
      aria-label="Queue pagination"
      {...props}
    >
      <span>{resultLabel ?? fallbackLabel}</span>
      <div className="flex gap-2">
        {previousHref ? (
          <a className="rounded-md border border-slate-300 px-3 py-1.5" href={previousHref}>
            Previous
          </a>
        ) : null}
        {nextHref ? (
          <a className="rounded-md border border-slate-300 px-3 py-1.5" href={nextHref}>
            Next
          </a>
        ) : null}
      </div>
    </nav>
  );
}

export type QueueEmptyProps = Omit<EmptyStateProps, "title" | "description"> & {
  title?: ReactNode;
  description?: ReactNode;
  clearFiltersHref?: string;
};

export function QueueEmpty({
  variant = "noData",
  title,
  description,
  clearFiltersHref,
  primaryAction,
  secondaryAction,
  ...props
}: QueueEmptyProps) {
  const defaults = {
    firstRun: {
      title: "No records yet",
      description: "Connect or sync a source to create the first records.",
    },
    filtered: {
      title: "No matching records",
      description: "Adjust the filters or clear them to see more results.",
    },
    noData: {
      title: "No records",
      description: "There are no records to show.",
    },
    permission: {
      title: "Permission required",
      description: "You do not have access to these records.",
    },
    disconnected: {
      title: "Source disconnected",
      description: "Reconnect the source to load records.",
    },
    archived: {
      title: "No active records",
      description: "Archived or closed records are not shown here.",
    },
  } satisfies Record<NonNullable<QueueEmptyProps["variant"]>, {
    title: string;
    description: string;
  }>;

  return (
    <EmptyState
      variant={variant}
      title={title ?? defaults[variant].title}
      description={description ?? defaults[variant].description}
      primaryAction={primaryAction}
      secondaryAction={
        secondaryAction ??
        (clearFiltersHref ? (
          <a href={clearFiltersHref} className="text-sm font-medium text-slate-700 underline">
            Clear filters
          </a>
        ) : null)
      }
      {...props}
    />
  );
}

export type QueueLoadingProps = ComponentPropsWithoutRef<"div"> & {
  rows?: number;
  columns?: number;
};

export function QueueLoading({ rows = 5, className, ...props }: QueueLoadingProps) {
  return <LoadingSkeleton variant="queue" rows={rows} className={className} {...props} />;
}

export { Panel };
