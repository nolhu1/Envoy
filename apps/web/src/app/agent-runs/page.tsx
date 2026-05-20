import {
  Badge,
  EmptyState,
  FilterBar,
  FilterField,
  Input,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueTable,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import {
  formatAgentRunJobType,
  listAgentRunHistory,
  type AgentRunHistoryRow,
} from "@/lib/agent-run-history";
import { formatOperatorType } from "@/lib/operator-utils";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type AgentRunsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function statusVariant(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED" || status === "DEAD_LETTERED") return "critical" as const;
  if (status === "RUNNING" || status === "QUEUED") return "warning" as const;
  return "neutral" as const;
}

export default async function AgentRunsPage({
  searchParams,
}: AgentRunsPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const params = searchParams ? await searchParams : undefined;
  const filters = {
    status: readSearchParam(params?.status),
    triggerType: readSearchParam(params?.triggerType),
    conversationId: readSearchParam(params?.conversationId),
  };
  const rows = await listAgentRunHistory({
    workspaceId: authContext.workspaceId,
    filters,
  });

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Agent Runs"
          description="Worker-backed manual and automatic agent draft runs. AI output remains draft-only and approval-gated."
        />

        <QueueContainer
          title="Agent runtime history"
          description={`${rows.length} durable agent runtime jobs`}
          filters={
            <FilterBar resetHref="/agent-runs">
              <FilterField label="Status">
                <Input name="status" defaultValue={filters.status ?? ""} placeholder="COMPLETED" />
              </FilterField>
              <FilterField label="Trigger">
                <Input name="triggerType" defaultValue={filters.triggerType ?? ""} placeholder="manual_regenerate" />
              </FilterField>
              <FilterField label="Conversation">
                <Input name="conversationId" defaultValue={filters.conversationId ?? ""} />
              </FilterField>
            </FilterBar>
          }
        >
          <QueueTable<AgentRunHistoryRow>
            rows={rows}
            getRowId={(row) => row.id}
            getRowHref={(row) => `/agent-runs/${row.id}`}
            gridTemplateColumns="minmax(9rem,.8fr) minmax(10rem,1fr) minmax(14rem,1.4fr) minmax(12rem,1fr) minmax(14rem,1.4fr)"
            emptyState={
              <EmptyState
                variant="filtered"
                title="No agent runs"
                description="No manual or automatic agent runtime jobs match these filters."
              />
            }
            columns={[
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <div className="space-y-1">
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    <p className="text-xs text-slate-500">{formatAgentRunJobType(row.jobType)}</p>
                  </div>
                ),
              },
              {
                id: "trigger",
                header: "Trigger",
                cell: (row) => formatOperatorType(row.triggerType),
              },
              {
                id: "conversation",
                header: "Conversation",
                cell: (row) => (
                  <div>
                    <p>{row.conversationTitle}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {row.conversationId ?? "Not recorded"}
                    </p>
                  </div>
                ),
              },
              {
                id: "time",
                header: "Timing",
                cell: (row) => (
                  <div className="text-xs leading-5">
                    <p>Queued {formatDate(row.queuedAt)}</p>
                    <p>Done {formatDate(row.completedAt ?? row.failedAt ?? row.deadLetteredAt)}</p>
                  </div>
                ),
              },
              {
                id: "result",
                header: "Result",
                cell: (row) => (
                  <div className="text-xs leading-5">
                    <p>Draft: {row.draftMessageId ?? "Not recorded"}</p>
                    <p>Approval: {row.approvalRequestId ?? "Not recorded"}</p>
                    <p>{row.escalationOrSuppressionReason ?? row.errorSummary ?? "No issue recorded"}</p>
                  </div>
                ),
              },
            ]}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
