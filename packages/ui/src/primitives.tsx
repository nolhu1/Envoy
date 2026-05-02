import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "./utils";
import { severityVariants, type Severity } from "./tokens";
import type { BadgeVariant } from "./status";
import { getStatusDefinition, type StatusDomain } from "./status";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white shadow-sm shadow-slate-950/10 hover:bg-slate-800 active:bg-slate-950",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm shadow-slate-950/5 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  tertiary: "text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  danger:
    "border border-red-300 bg-white text-red-700 shadow-sm shadow-red-950/5 hover:border-red-400 hover:bg-red-50 active:bg-red-100",
  accent:
    "bg-sky-700 text-white shadow-sm shadow-sky-950/10 hover:bg-sky-600 active:bg-sky-800",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  iconStart,
  iconEnd,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-100 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        iconStart
      )}
      <span>{children}</span>
      {iconEnd}
    </button>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  invalid?: boolean;
  inputSize?: "sm" | "md";
};

export function Input({
  className,
  invalid = false,
  inputSize = "md",
  ...props
}: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-md border bg-white text-slate-950 shadow-sm shadow-slate-950/5 outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        inputSize === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-sm",
        invalid
          ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
          : "border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps =
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    invalid?: boolean;
  };

export function Textarea({ className, invalid = false, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-32 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-950 shadow-sm shadow-slate-950/5 outline-none transition-colors placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        invalid
          ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
          : "border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
        className,
      )}
      {...props}
    />
  );
}

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "size"
> & {
  options: SelectOption[];
  placeholder?: string;
  invalid?: boolean;
  selectSize?: "sm" | "md";
};

export function Select({
  className,
  options,
  placeholder,
  invalid = false,
  selectSize = "md",
  ...props
}: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-md border bg-white text-slate-950 shadow-sm shadow-slate-950/5 outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        selectSize === "sm" ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-sm",
        invalid
          ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
          : "border-slate-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
        className,
      )}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export type CheckboxProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type"
> & {
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
};

export function Checkbox({
  className,
  label,
  description,
  invalid = false,
  ...props
}: CheckboxProps) {
  return (
    <label className="flex items-start gap-3 text-sm text-slate-700">
      <input
        type="checkbox"
        aria-invalid={invalid || undefined}
        className={cn(
          "mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50",
          invalid && "border-red-300 focus:ring-red-100",
          className,
        )}
        {...props}
      />
      {label || description ? (
        <span className="grid gap-1">
          {label ? <span className="font-medium text-slate-700">{label}</span> : null}
          {description ? (
            <span className="text-xs leading-5 text-slate-500">{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-red-200 bg-red-50 text-red-800",
  platform: "border-slate-200 bg-white text-slate-600",
};

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: BadgeVariant;
  size?: "sm" | "md";
};

export function Badge({
  className,
  variant = "neutral",
  size = "sm",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium leading-none",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export type StatusBadgeProps = Omit<BadgeProps, "variant" | "children"> & {
  domain: StatusDomain;
  status: string;
  labelOverride?: string;
};

export function StatusBadge({
  domain,
  status,
  labelOverride,
  ...props
}: StatusBadgeProps) {
  const definition = getStatusDefinition(domain, status);
  return (
    <Badge variant={definition.badgeVariant} {...props}>
      {labelOverride ?? definition.label}
    </Badge>
  );
}

export type AlertProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  severity?: Severity;
  title: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
};

export function Alert({
  className,
  severity = "neutral",
  title,
  actions,
  children,
  dismissible,
  ...props
}: AlertProps) {
  return (
    <section
      className={cn(
        "rounded-lg border p-4 text-sm shadow-sm shadow-slate-950/5",
        severityVariants[severity].surface,
        className,
      )}
      role={severity === "critical" ? "alert" : "status"}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {children ? <div className="mt-1 leading-5">{children}</div> : null}
        </div>
        {dismissible ? (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium hover:bg-black/5"
            aria-label="Dismiss alert"
          >
            Dismiss
          </button>
        ) : null}
      </div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

export type PanelProps = ComponentPropsWithoutRef<"section"> & {
  variant?: "default" | "subtle" | "danger" | "warning";
  padding?: "none" | "sm" | "md" | "lg";
};

const panelVariants: Record<NonNullable<PanelProps["variant"]>, string> = {
  default: "border-slate-200 bg-white",
  subtle: "border-slate-200 bg-slate-50",
  danger: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
};

const panelPadding: Record<NonNullable<PanelProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Panel({
  className,
  variant = "default",
  padding = "md",
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-lg border shadow-sm shadow-slate-950/5",
        panelVariants[variant],
        panelPadding[padding],
        className,
      )}
      {...props}
    />
  );
}

export type ModalProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
};

export function Modal({
  open,
  title,
  description,
  footer,
  children,
  className,
  ...props
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
      role="presentation"
    >
      <div
        className={cn("w-full max-w-lg rounded-xl bg-white p-6 shadow-lg", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        {...props}
      >
        <h2 id="modal-title" className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-5 text-slate-600">{description}</p>
        ) : null}
        <div className="mt-5">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export type DrawerProps = Omit<ComponentPropsWithoutRef<"aside">, "title"> & {
  open: boolean;
  title: ReactNode;
  side?: "left" | "right" | "bottom";
};

export function Drawer({
  open,
  title,
  side = "right",
  children,
  className,
  ...props
}: DrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30" role="presentation">
      <aside
        className={cn(
          "fixed bg-white p-4 shadow-lg",
          side === "bottom"
            ? "inset-x-0 bottom-0 rounded-t-xl"
            : side === "left"
              ? "inset-y-0 left-0 w-80 max-w-[85vw]"
              : "inset-y-0 right-0 w-80 max-w-[85vw]",
          className,
        )}
        aria-labelledby="drawer-title"
        {...props}
      >
        <h2 id="drawer-title" className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </aside>
    </div>
  );
}

export type TabItem = {
  value: string;
  label: ReactNode;
  href?: string;
  count?: number;
};

export type TabsProps = ComponentPropsWithoutRef<"div"> & {
  items: TabItem[];
  value: string;
  onValueChange?: (value: string) => void;
};

export function Tabs({ items, value, onValueChange, className, ...props }: TabsProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1",
        className,
      )}
      role="tablist"
      {...props}
    >
      {items.map((item) => {
        const active = item.value === value;
        const content = (
          <>
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span className="tabular-nums text-slate-500">{item.count}</span>
            ) : null}
          </>
        );

        if (item.href) {
          return (
            <a
              key={item.value}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
                active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
              )}
              role="tab"
              aria-selected={active}
            >
              {content}
            </a>
          );
        }

        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600",
            )}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange?.(item.value)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export type TooltipProps = ComponentPropsWithoutRef<"span"> & {
  content: ReactNode;
};

export function Tooltip({ content, children, className, ...props }: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)} {...props}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs text-white group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}
