DO $$
DECLARE
  retired_platform text := chr(83) || chr(76) || chr(65) || chr(67) || chr(75);
  retired_table text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'Platform'
      AND enum_value.enumlabel = retired_platform
  ) THEN
    FOREACH retired_table IN ARRAY ARRAY[
      'Attachment',
      'Message',
      'Participant',
      'Conversation',
      'Integration'
    ]
    LOOP
      EXECUTE format(
        'DELETE FROM %I WHERE "platform" = %L',
        retired_table,
        retired_platform
      );
    END LOOP;
  END IF;
END $$;

ALTER TYPE "Platform" RENAME TO "Platform_old";
CREATE TYPE "Platform" AS ENUM ('EMAIL');

ALTER TABLE "Integration"
  ALTER COLUMN "platform" TYPE "Platform"
  USING "platform"::text::"Platform";

ALTER TABLE "Conversation"
  ALTER COLUMN "platform" TYPE "Platform"
  USING "platform"::text::"Platform";

ALTER TABLE "Participant"
  ALTER COLUMN "platform" TYPE "Platform"
  USING "platform"::text::"Platform";

ALTER TABLE "Message"
  ALTER COLUMN "platform" TYPE "Platform"
  USING "platform"::text::"Platform";

ALTER TABLE "Attachment"
  ALTER COLUMN "platform" TYPE "Platform"
  USING "platform"::text::"Platform";

DROP TYPE "Platform_old";
