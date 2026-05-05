CREATE TYPE "RuntimeJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'DEAD_LETTERED',
  'CANCELLED'
);

CREATE TYPE "RuntimeJobAttemptStatus" AS ENUM (
  'RUNNING',
  'SUCCEEDED',
  'FAILED'
);

CREATE TABLE "RuntimeJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "dedupeKey" TEXT,
  "bullJobId" TEXT,
  "status" "RuntimeJobStatus" NOT NULL DEFAULT 'QUEUED',
  "payloadJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "attemptsMade" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL,
  "runAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "deadLetteredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "lastErrorJson" JSONB,
  "replayOfJobId" TEXT,
  "sourceEventId" TEXT,
  "idempotencyRecordId" TEXT,

  CONSTRAINT "RuntimeJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuntimeJobAttempt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runtimeJobId" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "workerId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" "RuntimeJobAttemptStatus" NOT NULL,
  "errorJson" JSONB,
  "resultJson" JSONB,

  CONSTRAINT "RuntimeJobAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeadLetterRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "runtimeJobId" TEXT,
  "queueName" TEXT,
  "reason" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "errorJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "replayRequestedAt" TIMESTAMP(3),
  "replayedAsEventId" TEXT,
  "replayedAsJobId" TEXT,
  "resolutionJson" JSONB,

  CONSTRAINT "DeadLetterRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RuntimeJob_queueName_dedupeKey_key" ON "RuntimeJob"("queueName", "dedupeKey");
CREATE INDEX "RuntimeJob_workspaceId_queueName_status_idx" ON "RuntimeJob"("workspaceId", "queueName", "status");
CREATE INDEX "RuntimeJob_workspaceId_sourceEventId_idx" ON "RuntimeJob"("workspaceId", "sourceEventId");
CREATE INDEX "RuntimeJob_bullJobId_idx" ON "RuntimeJob"("bullJobId");

CREATE UNIQUE INDEX "RuntimeJobAttempt_runtimeJobId_attempt_key" ON "RuntimeJobAttempt"("runtimeJobId", "attempt");
CREATE INDEX "RuntimeJobAttempt_workspaceId_queueName_status_idx" ON "RuntimeJobAttempt"("workspaceId", "queueName", "status");

CREATE INDEX "DeadLetterRecord_workspaceId_kind_createdAt_idx" ON "DeadLetterRecord"("workspaceId", "kind", "createdAt");
CREATE INDEX "DeadLetterRecord_workspaceId_replayRequestedAt_idx" ON "DeadLetterRecord"("workspaceId", "replayRequestedAt");
CREATE INDEX "DeadLetterRecord_sourceEventId_idx" ON "DeadLetterRecord"("sourceEventId");
CREATE INDEX "DeadLetterRecord_runtimeJobId_idx" ON "DeadLetterRecord"("runtimeJobId");

ALTER TABLE "RuntimeJob"
  ADD CONSTRAINT "RuntimeJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RuntimeJobAttempt"
  ADD CONSTRAINT "RuntimeJobAttempt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RuntimeJobAttempt"
  ADD CONSTRAINT "RuntimeJobAttempt_runtimeJobId_fkey"
  FOREIGN KEY ("runtimeJobId") REFERENCES "RuntimeJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadLetterRecord"
  ADD CONSTRAINT "DeadLetterRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
