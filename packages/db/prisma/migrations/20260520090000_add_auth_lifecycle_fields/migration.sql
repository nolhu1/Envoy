-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "emailVerified" TIMESTAMP(3),
  ADD COLUMN "mfaEnrolledAt" TIMESTAMP(3),
  ADD COLUMN "mfaRequiredAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Existing local MVP accounts predate verification. Treat them as trusted.
UPDATE "User"
SET "emailVerified" = COALESCE("emailVerified", "createdAt"),
    "passwordChangedAt" = COALESCE("passwordChangedAt", "updatedAt")
WHERE "passwordHash" IS NOT NULL;
