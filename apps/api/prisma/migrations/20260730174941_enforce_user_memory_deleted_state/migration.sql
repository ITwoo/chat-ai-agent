-- This is an empty migration.
UPDATE "UserMemory"
SET
    "content" = '',
    "sourceMessageId" = NULL,
    "deletedAt" = COALESCE("deletedAt", "updatedAt"),
    "embedding" = NULL
WHERE "status" = 'DELETED'::"UserMemoryStatus";

UPDATE "UserMemory"
SET "deletedAt" = NULL
WHERE "status" <> 'DELETED'::"UserMemoryStatus";

ALTER TABLE "UserMemory"
ADD CONSTRAINT "UserMemory_deleted_state_check"
CHECK (
    (
        "status" = 'DELETED'::"UserMemoryStatus"
        AND "deletedAt" IS NOT NULL
        AND "sourceMessageId" IS NULL
        AND "content" = ''
        AND "embedding" IS NULL
    )
    OR
    (
        "status" <> 'DELETED'::"UserMemoryStatus"
        AND "deletedAt" IS NULL
    )
);