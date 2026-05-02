import {
  Alert,
  AppShell,
  Button,
  EmptyState,
  PageContainer,
  QueueEmpty,
  StatusBadge,
} from "@envoy/ui";

export function UICompileCheck() {
  return (
    <AppShell
      navItems={[{ label: "Inbox", href: "/", active: true }]}
      workspace={{ name: "Workspace" }}
      user={{ email: "operator@example.com", role: "ADMIN" }}
    >
      <PageContainer>
        <Alert severity="info" title="Compile check">
          Shared Envoy UI components are importable from the web app.
        </Alert>
        <div className="mt-4 flex items-center gap-2">
          <StatusBadge domain="conversation" status="ACTIVE" />
          <Button type="button">Action</Button>
        </div>
        <EmptyState
          className="mt-4"
          title="No records"
          description="This compile-only component is not routed."
        />
        <QueueEmpty className="mt-4" variant="filtered" />
      </PageContainer>
    </AppShell>
  );
}
