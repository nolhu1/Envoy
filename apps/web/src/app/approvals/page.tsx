import {
  Badge,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueEmpty,
  QueueTable,
  StatusBadge,
  Tabs,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import {
  listCurrentWorkspaceApprovalQueue,
  type ApprovalQueueListRow,
} from "@/lib/approval-queue";
import { PERMISSIONS, requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ApprovalQueuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ApprovalQueueView = "pending" | "reviewed";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readApprovalQueueView(
  searchParams?: Record<string, string | string[] | undefined>,
): ApprovalQueueView {
  return readSearchParam(searchParams?.view) === "reviewed"
    ? "reviewed"
    : "pending";
}

function formatTimestamp(value: Date | null) {
  if (!value) {
    return "Pending review";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function ApprovalQueuePage({
  searchParams,
}: ApprovalQueuePageProps) {
  await requirePermission(PERMISSIONS.APPROVE_DRAFTS);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const view = readApprovalQueueView(resolvedSearchParams);
  const rows: ApprovalQueueListRow[] = await listCurrentWorkspaceApprovalQueue({
    filter: view === "reviewed" ? "RECENTLY_REVIEWED" : "PENDING",
    limit: 100,
  });

  return (
    <ProductShell activeSection="approvals">
      <PageContainer width="wide">
        <PageHeader
          title="Approvals"
          description="Review AI-generated outbound drafts before they continue."
        />

        <QueueContainer
          title={view === "reviewed" ? "Recently reviewed" : "Pending review"}
          description={
            rows.length === 0
              ? view === "reviewed"
                ? "No recently reviewed approvals are available."
                : "No drafts are waiting for review."
              : view === "reviewed"
                ? `${rows.length} recently reviewed approvals.`
                : `${rows.length} drafts waiting for review.`
          }
          actions={
            <Tabs
              value={view}
              items={[
                { value: "pending", label: "Pending", href: "/approvals" },
                {
                  value: "reviewed",
                  label: "Recently reviewed",
                  href: "/approvals?view=reviewed",
                },
              ]}
            />
          }
        >
          <QueueTable<ApprovalQueueListRow>
            rows={rows}
            getRowId={(row: ApprovalQueueListRow) => row.approvalRequestId}
            getRowHref={(row: ApprovalQueueListRow) =>
              `/approvals/${row.approvalRequestId}`
            }
            gridTemplateColumns="minmax(16rem,1.6fr) minmax(16rem,1.4fr) minmax(11rem,0.9fr) minmax(10rem,0.8fr)"
            emptyState={
              <QueueEmpty
                variant="noData"
                title={
                  view === "reviewed"
                    ? "No reviewed approvals"
                    : "No pending approvals"
                }
                description={
                  view === "reviewed"
                    ? "Reviewed approval decisions will appear here."
                    : "Drafts that require human review will appear here."
                }
              />
            }
            columns={[
              {
                id: "conversation",
                header: "Conversation",
                mobileLabel: "Conversation",
                cell: (row: ApprovalQueueListRow) => (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="platform">
                        {row.conversation.platform === "SLACK" ? "Slack" : "Gmail"}
                      </Badge>
                      <StatusBadge domain="approval" status={row.status} />
                    </div>
                    <p className="mt-2 truncate font-semibold text-slate-950">
                      {row.title}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-600">
                      {row.participantSummary}
                    </p>
                  </div>
                ),
              },
              {
                id: "draft",
                header: "Draft preview",
                mobileLabel: "Draft",
                cell: (row: ApprovalQueueListRow) => (
                  <p className="line-clamp-3 text-sm leading-5">
                    {row.draftPreview}
                  </p>
                ),
              },
              {
                id: "assignment",
                header: "Assignment",
                mobileLabel: "Assignment",
                cell: (row: ApprovalQueueListRow) =>
                  row.assignedAgentLabel ?? "Unassigned",
              },
              {
                id: "timestamp",
                header: view === "reviewed" ? "Reviewed" : "Created",
                mobileLabel: view === "reviewed" ? "Reviewed" : "Created",
                cell: (row: ApprovalQueueListRow) =>
                  formatTimestamp(view === "reviewed" ? row.reviewedAt : row.createdAt),
              },
            ]}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
