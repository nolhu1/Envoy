-- CreateTable
CREATE TABLE "ConnectorSecret" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT,
    "secretType" TEXT NOT NULL,
    "secretRef" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectorSecret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSecret_secretRef_key" ON "ConnectorSecret"("secretRef");

-- CreateIndex
CREATE INDEX "ConnectorSecret_workspaceId_secretType_idx" ON "ConnectorSecret"("workspaceId", "secretType");

-- CreateIndex
CREATE INDEX "ConnectorSecret_workspaceId_integrationId_idx" ON "ConnectorSecret"("workspaceId", "integrationId");

-- CreateIndex
CREATE INDEX "ConnectorSecret_workspaceId_revokedAt_idx" ON "ConnectorSecret"("workspaceId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ConnectorSecret" ADD CONSTRAINT "ConnectorSecret_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorSecret" ADD CONSTRAINT "ConnectorSecret_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
