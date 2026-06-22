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
  StatusBadge,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import {
  listApprovalHistory,
  type ApprovalHistoryRow,
} from "@/lib/approval-history";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ApprovalHistoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
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

export default async function ApprovalHistoryPage({
  searchParams,
}: ApprovalHistoryPageProps) {
  const authContext = await requirePermission(PERMISSIONS.VIEW_AUDIT_LOGS);
  const params = searchParams ? await searchParams : undefined;
  const filters = {
    status: readSearchParam(params?.status),
    reviewerId: readSearchParam(params?.reviewerId),
    conversationId: readSearchParam(params?.conversationId),
    from: readSearchParam(params?.from),
    to: readSearchParam(params?.to),
  };
  const rows = await listApprovalHistory({
    workspaceId: authContext.workspaceId,
    filters,
  });

  return (
    <ProductShell activeSection="operator">
      <PageContainer width="wide">
        <PageHeader
          title="Approval History"
          description="Approval status, reviewer audit, draft send result, and related runtime failures."
        />

        <QueueContainer
          title="Approvals"
          description={`${rows.length} approval records`}
          filters={
            <FilterBar resetHref="/approval-history">
              <FilterField label="Status">
                <Input name="status" defaultValue={filters.status ?? ""} placeholder="APPROVED" />
              </FilterField>
              <FilterField label="Reviewer ID">
                <Input name="reviewerId" defaultValue={filters.reviewerId ?? ""} />
              </FilterField>
              <FilterField label="Conversation">
                <Input name="conversationId" defaultValue={filters.conversationId ?? ""} />
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
          <QueueTable<ApprovalHistoryRow>
            rows={rows}
            getRowId={(row) => row.id}
            getRowHref={(row) => `/approvals/${row.id}`}
            gridTemplateColumns="minmax(9rem,.8fr) minmax(14rem,1.2fr) minmax(12rem,1fr) minmax(16rem,1.6fr) minmax(12rem,1fr)"
            emptyState={
              <EmptyState
                variant="filtered"
                title="No approvals"
                description="No approval records match these filters."
              />
            }
            columns={[
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <div className="space-y-1">
                    <StatusBadge domain="approval" status={row.status} />
                    <Badge variant="platform">Gmail</Badge>
                  </div>
                ),
              },
              {
                id: "review",
                header: "Review",
                cell: (row) => (
                  <div className="text-xs leading-5">
                    <p>{row.reviewer}</p>
                    <p>Created {formatDate(row.createdAt)}</p>
                    <p>Reviewed {formatDate(row.reviewedAt)}</p>
                  </div>
                ),
              },
              {
                id: "conversation",
                header: "Conversation",
                cell: (row) => (
                  <div>
                    <p>{row.conversationTitle}</p>
                    <p className="font-mono text-xs text-slate-500">{row.conversationId}</p>
                  </div>
                ),
              },
              {
                id: "draft",
                header: "Draft",
                cell: (row) => (
                  <div className="text-xs leading-5">
                    <p>{row.draftPreview}</p>
                    <p>{row.editedContentIndicator}</p>
                    <p>Message: {row.draftMessageId}</p>
                    {row.rejectionReason ? <p>Rejected: {row.rejectionReason}</p> : null}
                    <p>Revision metadata: {row.revisedDraftChain}</p>
                  </div>
                ),
              },
              {
                id: "send",
                header: "Send result",
                cell: (row) => (
                  <div className="space-y-2 text-xs leading-5">
                    <p>{row.sendResult}</p>
                    {row.runtimeError ? <p>{row.runtimeError}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {linkPill(`/approvals/${row.id}`, "Approval")}
                      {linkPill(`/conversations/${row.conversationId}`, "Conversation")}
                      {row.runtimeJobId
                        ? linkPill(`/runtime-jobs/${row.runtimeJobId}`, "Runtime job")
                        : null}
                    </div>
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
