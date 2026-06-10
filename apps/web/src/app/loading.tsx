import {
  PageContainer,
  PageHeader,
  QueueContainer,
  QueueLoading,
} from "@envoy/ui";

export default function InboxLoading() {
  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <PageContainer width="wide">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <PageHeader
            title="Loading Envoy"
            description="Preparing the current page."
          />
          <QueueContainer
            title="Loading"
            description="Fetching the latest workspace data..."
          >
            <QueueLoading rows={8} />
          </QueueContainer>
        </div>
      </PageContainer>
    </main>
  );
}
