import {
  ActiveFilters,
  Badge,
  Checkbox,
  FilterBar,
  FilterField,
  Input,
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueEmpty,
  QueueTable,
  Select,
  StatusBadge,
} from "@envoy/ui";

import { ProductShell } from "@/components/product-shell";
import { requireAppAuthContext } from "@/lib/app-auth";
import {
  getCurrentWorkspaceInboxAssigneeOptions,
  getCurrentWorkspaceInboxRowsWithFilters,
  readInboxFilters,
  type InboxAssigneeOption,
  type InboxRow,
} from "@/lib/inbox";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function hasActiveFilters(filters: ReturnType<typeof readInboxFilters>) {
  return (
    filters.query !== "" ||
    filters.platform !== "ALL" ||
    filters.state !== "ALL" ||
    filters.assigneeId !== "ALL" ||
    filters.agent !== "any" ||
    filters.awaitingApproval
  );
}

function buildActiveFilters(
  filters: ReturnType<typeof readInboxFilters>,
  assigneeOptions: InboxAssigneeOption[],
) {
  const activeFilters = [];
  const assignee = assigneeOptions.find((option) => option.id === filters.assigneeId);

  if (filters.query) {
    activeFilters.push({ key: "q", label: "Search", value: filters.query });
  }

  if (filters.platform !== "ALL") {
    activeFilters.push({
      key: "platform",
      label: "Platform",
      value: filters.platform === "EMAIL" ? "Gmail" : "Slack",
    });
  }

  if (filters.state !== "ALL") {
    activeFilters.push({
      key: "state",
      label: "State",
      value: filters.state.replaceAll("_", " ").toLowerCase(),
    });
  }

  if (filters.agent !== "any") {
    activeFilters.push({
      key: "agent",
      label: "Assignment",
      value: filters.agent === "has" ? "Has agent" : "No agent",
    });
  }

  if (filters.assigneeId !== "ALL") {
    activeFilters.push({
      key: "assignee",
      label: "Assignee",
      value: assignee?.label ?? filters.assigneeId,
    });
  }

  if (filters.awaitingApproval) {
    activeFilters.push({
      key: "awaitingApproval",
      label: "Approval",
      value: "Awaiting approval",
    });
  }

  return activeFilters;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  await requireAppAuthContext();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters = readInboxFilters(resolvedSearchParams);
  const [inboxRows, assigneeOptions]: [InboxRow[], InboxAssigneeOption[]] =
    await Promise.all([
      getCurrentWorkspaceInboxRowsWithFilters(filters),
      getCurrentWorkspaceInboxAssigneeOptions(),
    ]);
  const activeFilters = buildActiveFilters(filters, assigneeOptions);
  const filtered = hasActiveFilters(filters);

  return (
    <ProductShell activeSection="inbox">
      <PageContainer width="wide">
        <PageHeader
          title="Inbox"
          description="Triage canonical Gmail and Slack conversations across the workspace."
        />

        <QueueContainer
          title="Conversations"
          description={
            inboxRows.length === 0
              ? filtered
                ? "No conversations match the active filters."
                : "No conversations have been ingested yet."
              : `${inboxRows.length} conversations`
          }
          filters={
            <FilterBar resetHref="/" mobileMode="drawer">
              <FilterField label="Search">
                <Input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Subject, participant, or message text"
                />
              </FilterField>
              <FilterField label="Platform">
                <Select
                  name="platform"
                  defaultValue={filters.platform}
                  options={[
                    { value: "ALL", label: "All platforms" },
                    { value: "EMAIL", label: "Gmail" },
                    { value: "SLACK", label: "Slack" },
                  ]}
                />
              </FilterField>
              <FilterField label="State">
                <Select
                  name="state"
                  defaultValue={filters.state}
                  options={[
                    { value: "ALL", label: "All states" },
                    { value: "UNASSIGNED", label: "Unassigned" },
                    { value: "ACTIVE", label: "Active" },
                    { value: "WAITING", label: "Waiting" },
                    { value: "FOLLOW_UP_DUE", label: "Follow-up due" },
                    { value: "AWAITING_APPROVAL", label: "Awaiting approval" },
                    { value: "ESCALATED", label: "Escalated" },
                    { value: "COMPLETED", label: "Completed" },
                    { value: "CLOSED", label: "Closed" },
                  ]}
                />
              </FilterField>
              <FilterField label="Assignment">
                <Select
                  name="agent"
                  defaultValue={filters.agent}
                  options={[
                    { value: "any", label: "Any assignment" },
                    { value: "has", label: "Has agent" },
                    { value: "none", label: "No agent" },
                  ]}
                />
              </FilterField>
              <FilterField label="Assignee">
                <Select
                  name="assignee"
                  defaultValue={filters.assigneeId}
                  options={[
                    { value: "ALL", label: "Any assignee" },
                    ...assigneeOptions.map((option) => ({
                      value: option.id,
                      label: option.label,
                    })),
                  ]}
                />
              </FilterField>
              <div className="flex items-end">
                <Checkbox
                  name="awaitingApproval"
                  value="true"
                  label="Awaiting approval"
                  defaultChecked={filters.awaitingApproval}
                />
              </div>
            </FilterBar>
          }
          activeFilters={<ActiveFilters filters={activeFilters} clearHref="/" />}
        >
          <QueueTable
            rows={inboxRows}
            getRowId={(row) => row.conversationId}
            getRowHref={(row) => `/conversations/${row.conversationId}`}
            gridTemplateColumns="minmax(18rem,2fr) minmax(11rem,1fr) minmax(12rem,1fr) minmax(10rem,0.9fr)"
            emptyState={
              <QueueEmpty
                variant={filtered ? "filtered" : "firstRun"}
                clearFiltersHref={filtered ? "/" : undefined}
                title={
                  filtered ? "No matching conversations" : "No conversations yet"
                }
                description={
                  filtered
                    ? "Adjust the filters or clear them to return to the full queue."
                    : "Run a connector sync from integration settings to populate the inbox."
                }
              />
            }
            columns={[
              {
                id: "conversation",
                header: "Conversation",
                mobileLabel: "Conversation",
                cell: (row) => (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="platform">
                        {row.platform === "SLACK" ? "Slack" : "Gmail"}
                      </Badge>
                      <StatusBadge
                        domain="conversation"
                        status={row.conversationState}
                      />
                      {row.hasSendFailure ? (
                        <StatusBadge domain="message" status="FAILED" />
                      ) : null}
                    </div>
                    <p className="mt-2 truncate font-semibold text-slate-950">
                      {row.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
                      {row.lastMessagePreview}
                    </p>
                  </div>
                ),
              },
              {
                id: "participants",
                header: "Participants",
                mobileLabel: "Participants",
                cell: (row) => row.participantSummary,
              },
              {
                id: "assignment",
                header: "Assignment",
                mobileLabel: "Assignment",
                cell: (row) =>
                  row.assignedAgentLabel ? (
                    <span className="line-clamp-2">{row.assignedAgentLabel}</span>
                  ) : (
                    <Badge variant="neutral">Unassigned</Badge>
                  ),
              },
              {
                id: "activity",
                header: "Last activity",
                mobileLabel: "Last activity",
                cell: (row) => formatTimestamp(row.lastActivityAt),
              },
            ]}
          />
        </QueueContainer>
      </PageContainer>
    </ProductShell>
  );
}
