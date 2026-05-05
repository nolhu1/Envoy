import { getEventJournalRecordByEventId } from "../../../packages/db/src/index";
import { WORKER_JOB_TYPES } from "./jobs";
import { WORKER_QUEUE_NAMES, enqueueRuntimeJob } from "./queues";

export async function enqueueEventJournalProcessing(eventId: string) {
  const eventJournal = await getEventJournalRecordByEventId(eventId);

  if (!eventJournal) {
    throw new Error(`Event journal record ${eventId} could not be loaded.`);
  }

  return enqueueRuntimeJob({
    queueName: WORKER_QUEUE_NAMES.EVENTS,
    jobType: WORKER_JOB_TYPES.EVENTS_PROCESS_EVENT_PLACEHOLDER,
    workspaceId: eventJournal.workspaceId,
    payload: {
      workspaceId: eventJournal.workspaceId,
      eventId,
    },
    dedupeKey: `events:process:${eventId}`,
    sourceEventId: eventId,
  });
}
