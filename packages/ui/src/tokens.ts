export const spacing = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-6",
} as const;

export const typography = {
  pageTitle: "text-2xl font-semibold tracking-normal text-slate-950",
  sectionTitle: "text-lg font-semibold text-slate-950",
  subsectionTitle: "text-base font-semibold text-slate-950",
  body: "text-sm leading-5 text-slate-700",
  muted: "text-sm leading-5 text-slate-500",
  label: "text-xs font-medium text-slate-500",
  metric: "text-2xl font-semibold tabular-nums text-slate-950",
  mono: "font-mono text-xs text-slate-600",
} as const;

export const radius = {
  control: "rounded-md",
  panel: "rounded-lg",
  overlay: "rounded-xl",
  pill: "rounded-full",
} as const;

export const shadows = {
  none: "shadow-none",
  sm: "shadow-sm",
  lg: "shadow-lg",
} as const;

export const severityVariants = {
  critical: {
    surface: "border-red-200 bg-red-50 text-red-800",
    badge: "border-red-200 bg-red-50 text-red-800",
  },
  warning: {
    surface: "border-amber-200 bg-amber-50 text-amber-900",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  success: {
    surface: "border-emerald-200 bg-emerald-50 text-emerald-800",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  info: {
    surface: "border-sky-200 bg-sky-50 text-sky-800",
    badge: "border-sky-200 bg-sky-50 text-sky-800",
  },
  neutral: {
    surface: "border-slate-200 bg-slate-50 text-slate-700",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
  },
} as const;

export const statusColors = {
  platform: "border-slate-200 bg-white text-slate-600",
  ...severityVariants,
} as const;

export type Severity = keyof typeof severityVariants;
