import {
  Badge,
  EmptyState,
  FilterBar,
  FilterField,
  Input,
  MetadataList,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueTable,
  Timeline,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import {
  listOperatorAuditRows,
  type OperatorAuditRow,
} from "@/lib/audit-log-reader";
import { formatOperatorType } from "@/lib/operator-utils";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AuditPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function statusBadge(row: OperatorAuditRow) {
  if (!row.status) {
    return <Badge variant="neutral">{formatOperatorType(row.kind)}</Badge>;
  }

  return <Badge variant={row.severity === "critical" ? "critical" : row.severity === "warning" ? "warning" : row.severity === "success" ? "success" : "neutral"}>{formatOperatorType(row.status)}</Badge>;
}

function linkPill(href: string, label: string) {
  return (
    <a
      href={href}
      className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 underline"
    >
      {label}
    </a>
  );
}

export default async function WorkspaceAuditPage({
  searchParams,
}: AuditPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const params = searchParams ? await searchParams : undefined;
  const filters = {
    actorType: readSearchParam(params?.actorType),
    actionType: readSearchParam(params?.actionType),
    resourceType: readSearchParam(params?.resourceType),
    platform: readSearchParam(params?.platform),
    conversationId: readSearchParam(params?.conversationId),
    approvalRequestId: readSearchParam(params?.approvalRequestId),
    status: readSearchParam(params?.status),
    from: readSearchParam(params?.from),
    to: readSearchParam(params?.to),
  };
  const rows = await listOperatorAuditRows({
    workspaceId: authContext.workspaceId,
    filters,
  });

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Audit"
          description="Workspace-scoped action logs and durable event journal records for operator inspection."
        />

        <QueueContainer
          title="Audit records"
          description={`${rows.length} records from ActionLog and EventJournal`}
          filters={
            <FilterBar resetHref="/settings/audit">
              <FilterField label="Actor">
                <Input name="actorType" defaultValue={filters.actorType ?? ""} placeholder="USER" />
              </FilterField>
              <FilterField label="Action / event">
                <Input name="actionType" defaultValue={filters.actionType ?? ""} placeholder="message_sent" />
              </FilterField>
              <FilterField label="Resource">
                <Input name="resourceType" defaultValue={filters.resourceType ?? ""} placeholder="message" />
              </FilterField>
              <FilterField label="Platform">
                <Input name="platform" defaultValue={filters.platform ?? ""} placeholder="EMAIL or SLACK" />
              </FilterField>
              <FilterField label="Conversation">
                <Input name="conversationId" defaultValue={filters.conversationId ?? ""} />
              </FilterField>
              <FilterField label="Approval">
                <Input name="approvalRequestId" defaultValue={filters.approvalRequestId ?? ""} />
              </FilterField>
              <FilterField label="Status">
                <Input name="status" defaultValue={filters.status ?? ""} placeholder="FAILED" />
              </FilterField>
              <FilterField label="From">
                <Input name="from" type="date" defaultValue={filters.from ?? ""} />
              </FilterField>
              <FilterField label="To">
                <Input name="to" type="date" defaultValue={filters.to ?? ""} />
              </FilterField>
            </FilterBar>
          }
        >
          <QueueTable<OperatorAuditRow>
            rows={rows}
            getRowId={(row) => row.id}
            gridTemplateColumns="minmax(8rem,.8fr) minmax(11rem,1fr) minmax(9rem,.8fr) minmax(16rem,1.6fr) minmax(12rem,1fr)"
            emptyState={
              <EmptyState
                variant="filtered"
                title="No audit records"
                description="No action log or event journal records match these filters."
              />
            }
            columns={[
              {
                id: "when",
                header: "When",
                cell: (row) => (
                  <div>
                    <p>{formatTimestamp(row.timestamp)}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {row.kind}:{row.id.slice(0, 8)}
                    </p>
                  </div>
                ),
              },
              {
                id: "action",
                header: "Action / event",
                cell: (row) => (
                  <div className="space-y-1">
                    <p className="font-medium text-slate-950">
                      {formatOperatorType(row.actionOrEventType)}
                    </p>
                    {statusBadge(row)}
                  </div>
                ),
              },
              {
                id: "actor",
                header: "Actor",
                cell: (row) => row.actor,
              },
              {
                id: "resource",
                header: "Resource",
                cell: (row) => (
                  <div className="space-y-1 text-xs">
                    <p>{row.summary}</p>
                    <p>Resource: {row.resourceType ?? "Not recorded"} {row.resourceId ?? ""}</p>
                    {row.attemptSummary ? <p>{row.attemptSummary}</p> : null}
                  </div>
                ),
              },
              {
                id: "links",
                header: "Links",
                cell: (row) => (
                  <div className="flex flex-wrap gap-2">
                    {row.conversationId
                      ? linkPill(`/conversations/${row.conversationId}`, "Conversation")
                      : null}
                    {row.approvalRequestId
                      ? linkPill(`/approvals/${row.approvalRequestId}`, "Approval")
                      : null}
                    {row.runtimeJobId
                      ? linkPill(`/runtime-jobs/${row.runtimeJobId}`, "Runtime job")
                      : null}
                  </div>
                ),
              },
            ]}
          />
        </QueueContainer>

        <QueueContainer
          title="Recent timeline"
          description="Compact sequence view of the same filtered records."
        >
          <Timeline
            items={rows.slice(0, 12).map((row) => ({
              id: row.id,
              timestamp: formatTimestamp(row.timestamp),
              label: formatOperatorType(row.actionOrEventType),
              actor: row.actor,
              source: row.kind,
              severity: row.severity,
              description: (
                <MetadataList
                  items={[
                    { label: "Resource", value: `${row.resourceType ?? "n/a"} ${row.resourceId ?? ""}` },
                    { label: "Metadata", value: row.metadataSummary },
                    { label: "Processing", value: row.attemptSummary ?? "Not recorded" },
                  ]}
                />
              ),
              relatedLinks: (
                <>
                  {row.conversationId
                    ? linkPill(`/conversations/${row.conversationId}`, "Conversation")
                    : null}
                  {row.approvalRequestId
                    ? linkPill(`/approvals/${row.approvalRequestId}`, "Approval")
                    : null}
                </>
              ),
            }))}
            emptyState={
              <EmptyState
                variant="noData"
                title="No timeline records"
                description="Audit records will appear here as workspace actions occur."
              />
            }
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
