CREATE TYPE "IdempotencyRecordStatus" AS ENUM (
  'STARTED',
  'COMPLETED',
  'FAILED',
  'DUPLICATE'
);

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" "IdempotencyRecordStatus" NOT NULL,
  "integrationId" TEXT,
  "operationType" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "externalEventId" TEXT,
  "requestHash" TEXT,
  "resultSummaryJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "lockOwner" TEXT,
  "failedAt" TIMESTAMP(3),
  "lastErrorJson" JSONB,

  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_key" ON "IdempotencyRecord"("scope", "key");
CREATE INDEX "IdempotencyRecord_workspaceId_scope_status_idx" ON "IdempotencyRecord"("workspaceId", "scope", "status");
CREATE INDEX "IdempotencyRecord_workspaceId_resourceType_resourceId_idx" ON "IdempotencyRecord"("workspaceId", "resourceType", "resourceId");
CREATE INDEX "IdempotencyRecord_workspaceId_externalEventId_idx" ON "IdempotencyRecord"("workspaceId", "externalEventId");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
