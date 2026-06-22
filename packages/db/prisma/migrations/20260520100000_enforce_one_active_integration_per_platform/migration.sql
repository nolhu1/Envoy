WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "platform"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "Integration"
  WHERE "deletedAt" IS NULL
    AND "status" <> 'DISCONNECTED'
    AND "platform" IN ('EMAIL')
)
UPDATE "Integration"
SET
  "status" = 'DISCONNECTED',
  "deletedAt" = COALESCE("deletedAt", NOW()),
  "platformMetadataJson" =
    COALESCE("platformMetadataJson", '{}'::jsonb) ||
    jsonb_build_object(
      'v1IntegrationPolicy', 'one_active_per_platform',
      'supersededAt', NOW()
    )
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "Integration_one_active_platform_per_workspace_idx"
ON "Integration" ("workspaceId", "platform")
WHERE "deletedAt" IS NULL
  AND "status" <> 'DISCONNECTED'
  AND "platform" IN ('EMAIL');
