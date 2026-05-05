-- CreateEnum
CREATE TYPE "EventJournalStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTERED', 'REPLAY_REQUESTED');

-- CreateEnum
CREATE TYPE "EventProcessingStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "EventJournal" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "EventJournalStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "replayRequestedAt" TIMESTAMP(3),
    "replayOfEventId" TEXT,
    "lastErrorJson" JSONB,
    "metadataJson" JSONB,

    CONSTRAINT "EventJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventProcessingAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventJournalId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "status" "EventProcessingStatus" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorJson" JSONB,
    "resultJson" JSONB,
    "workerJobId" TEXT,
    "bullJobId" TEXT,

    CONSTRAINT "EventProcessingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventJournal_eventId_key" ON "EventJournal"("eventId");

-- CreateIndex
CREATE INDEX "EventJournal_workspaceId_eventType_occurredAt_idx" ON "EventJournal"("workspaceId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "EventJournal_workspaceId_status_availableAt_idx" ON "EventJournal"("workspaceId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "EventJournal_entityType_entityId_occurredAt_idx" ON "EventJournal"("entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "EventJournal_replayOfEventId_idx" ON "EventJournal"("replayOfEventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventProcessingAttempt_eventId_consumer_attempt_key" ON "EventProcessingAttempt"("eventId", "consumer", "attempt");

-- CreateIndex
CREATE INDEX "EventProcessingAttempt_workspaceId_consumer_status_nextRetryAt_idx" ON "EventProcessingAttempt"("workspaceId", "consumer", "status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EventProcessingAttempt_workerJobId_idx" ON "EventProcessingAttempt"("workerJobId");

-- AddForeignKey
ALTER TABLE "EventJournal" ADD CONSTRAINT "EventJournal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProcessingAttempt" ADD CONSTRAINT "EventProcessingAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventProcessingAttempt" ADD CONSTRAINT "EventProcessingAttempt_eventJournalId_fkey" FOREIGN KEY ("eventJournalId") REFERENCES "EventJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
