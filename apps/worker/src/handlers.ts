import { WORKER_JOB_TYPES, type WorkerJob } from "./jobs";
import {
  WorkerJobRegistry,
  WORKER_JOB_STATUSES,
  type WorkerJobResult,
} from "./registry";

function createPlaceholderResult(job: WorkerJob): WorkerJobResult {
  return {
    status: WORKER_JOB_STATUSES.COMPLETED,
    handledAt: new Date().toISOString(),
    output: {
      placeholder: true,
      jobType: job.jobType,
      workspaceId: job.workspaceId,
    },
  };
}

export function createWorkerJobRegistry() {
  return new WorkerJobRegistry()
    .register(WORKER_JOB_TYPES.CONNECTOR_SYNC, async ({ job }) => {
      console.log("[worker] connector_sync", job.jobId, job.payload);
      return createPlaceholderResult(job);
    })
    .register(WORKER_JOB_TYPES.CONNECTOR_PROCESS_EVENT, async ({ job }) => {
      console.log("[worker] connector_process_event", job.jobId, job.payload);
      return createPlaceholderResult(job);
    })
    .register(WORKER_JOB_TYPES.REMINDER, async ({ job }) => {
      console.log("[worker] reminder", job.jobId, job.payload);
      return createPlaceholderResult(job);
    })
    .register(WORKER_JOB_TYPES.APPROVAL_FOLLOW_UP, async ({ job }) => {
      console.log("[worker] approval_follow_up", job.jobId, job.payload);
      return createPlaceholderResult(job);
    })
    .register(WORKER_JOB_TYPES.AGENT_RUN, async ({ job }) => {
      console.log("[worker] agent_run", job.jobId, job.payload);
      return createPlaceholderResult(job);
    });
}
