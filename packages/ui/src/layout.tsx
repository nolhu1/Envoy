import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "./utils";
import { Button } from "./primitives";

export type NavItem = {
  label: ReactNode;
  href: string;
  active?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
};

export type UserMenu = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
  profileHref?: string;
  signOut?: ReactNode;
};

export type WorkspaceContext = {
  name: string;
  status?: ReactNode;
  switcher?: ReactNode;
};

export type AppShellProps = {
  navItems: NavItem[];
  workspace: WorkspaceContext;
  user: UserMenu;
  globalAlerts?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppShell({
  navItems,
  workspace,
  user,
  globalAlerts,
  children,
  className,
}: AppShellProps) {
  return (
    <div className={cn("min-h-screen bg-slate-50 text-slate-950", className)}>
      <div className="grid min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <SidebarNav items={navItems} className="hidden lg:flex" />
        <div className="min-w-0">
          <Topbar workspace={workspace} user={user} navItems={navItems} />
          <div className="border-b border-slate-200 bg-white/95 px-4 py-2 lg:hidden">
            <nav aria-label="Primary navigation" className="flex flex-wrap gap-1.5">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.disabled ? undefined : item.href}
                  aria-disabled={item.disabled || undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    item.active
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    item.disabled && "pointer-events-none opacity-50",
                  )}
                >
                  <span>{item.label}</span>
                  {item.badge}
                </a>
              ))}
            </nav>
          </div>
          {globalAlerts ? (
            <div className="border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
              {globalAlerts}
            </div>
          ) : null}
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}

export type SidebarNavProps = ComponentPropsWithoutRef<"nav"> & {
  items: NavItem[];
};

export function SidebarNav({ items, className, ...props }: SidebarNavProps) {
  return (
    <nav
      className={cn(
        "flex min-h-screen flex-col border-r border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5",
        className,
      )}
      aria-label="Primary navigation"
      {...props}
    >
      <div className="px-2 py-2 text-sm font-semibold text-slate-950">Envoy</div>
      <div className="mt-6 grid gap-1">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.disabled ? undefined : item.href}
            aria-disabled={item.disabled || undefined}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.active
                ? "bg-slate-100 text-slate-950"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              item.disabled && "pointer-events-none opacity-50",
            )}
          >
            <span>{item.label}</span>
            {item.badge}
          </a>
        ))}
      </div>
    </nav>
  );
}

export type TopbarProps = ComponentPropsWithoutRef<"header"> & {
  workspace: WorkspaceContext;
  user: UserMenu;
  navItems?: NavItem[];
  globalStatusSummary?: ReactNode;
};

export function Topbar({
  workspace,
  user,
  navItems,
  globalStatusSummary,
  className,
  ...props
}: TopbarProps) {
  const activeItem = navItems?.find((item) => item.active);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 shadow-sm shadow-slate-950/[0.03] backdrop-blur lg:px-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">
          {workspace.name}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {activeItem ? <span>{activeItem.label}</span> : null}
          {workspace.status ? <span>{workspace.status}</span> : null}
          {globalStatusSummary ? <span>{globalStatusSummary}</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {workspace.switcher}
        {user.profileHref ? (
          <a
            href={user.profileHref}
            className="hidden max-w-36 rounded-md px-2 py-1 text-right text-sm hover:bg-slate-100 sm:block"
          >
            <span className="block truncate font-medium text-slate-950">
              {user.name || user.email || "Profile"}
            </span>
            {user.role ? (
              <span className="block truncate text-xs text-slate-500">
                {user.role}
              </span>
            ) : null}
          </a>
        ) : (
          <div className="hidden max-w-36 text-right text-sm sm:block">
            <p className="truncate font-medium text-slate-950">
              {user.name || user.email || "Profile"}
            </p>
            {user.role ? (
              <p className="truncate text-xs text-slate-500">{user.role}</p>
            ) : null}
          </div>
        )}
        {user.signOut}
      </div>
    </header>
  );
}

export type PageContainerProps = ComponentPropsWithoutRef<"div"> & {
  width?: "standard" | "wide" | "full";
};

const pageWidths: Record<NonNullable<PageContainerProps["width"]>, string> = {
  standard: "max-w-5xl",
  wide: "max-w-screen-2xl",
  full: "max-w-none",
};

export function PageContainer({
  width = "wide",
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 py-7 sm:px-6 lg:px-8", pageWidths[width], className)}
      {...props}
    />
  );
}

export type PageHeaderProps = Omit<ComponentPropsWithoutRef<"header">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header className={cn("mb-7", className)} {...props}>
      {breadcrumbs ? <div className="mb-3 text-sm text-slate-500">{breadcrumbs}</div> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export type SectionHeaderProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function SectionHeader({
  title,
  description,
  actions,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-3 md:flex-row md:items-start md:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type SplitLayoutProps = ComponentPropsWithoutRef<"div"> & {
  primary: ReactNode;
  rail?: ReactNode;
  timeline?: ReactNode;
  railPosition?: "left" | "right";
};

export function SplitLayout({
  primary,
  rail,
  timeline,
  railPosition = "right",
  className,
  ...props
}: SplitLayoutProps) {
  const railContent = rail ? (
    <aside className="min-w-0 space-y-4">{rail}</aside>
  ) : null;

  return (
    <div
      className={cn(
        "grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]",
        railPosition === "left" && "lg:grid-cols-[22rem_minmax(0,1fr)]",
        className,
      )}
      {...props}
    >
      {railPosition === "left" ? railContent : null}
      <div className="min-w-0 space-y-6">
        {primary}
        {timeline}
      </div>
      {railPosition === "right" ? railContent : null}
    </div>
  );
}

export { Button };
