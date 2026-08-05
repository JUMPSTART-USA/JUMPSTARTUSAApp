-- Institution contacts: any number of designated people per facility
-- (chaplains, wardens, program/release coordinators…). Creates the table,
-- BACKFILLS it from the old flat chaplain*/primaryContact* columns, then
-- drops those columns.

-- CreateTable
CREATE TABLE "institution_contacts" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "institution_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_contacts_institutionId_idx" ON "institution_contacts"("institutionId");

-- AddForeignKey
ALTER TABLE "institution_contacts" ADD CONSTRAINT "institution_contacts_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one Chaplain row and one primary-contact row per institution
-- that had them (production has none; dev/demo data carries over).
INSERT INTO "institution_contacts" ("id", "institutionId", "name", "role", "phone", "email", "createdAt", "updatedAt")
SELECT gen_random_uuid(), i."id", i."chaplainName", 'Chaplain', i."chaplainPhone", i."chaplainEmail", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "institutions" i
WHERE i."chaplainName" IS NOT NULL;

INSERT INTO "institution_contacts" ("id", "institutionId", "name", "role", "phone", "email", "createdAt", "updatedAt")
SELECT gen_random_uuid(), i."id", i."primaryContactName", COALESCE(i."primaryContactRole", 'Primary contact'), i."primaryContactPhone", i."primaryContactEmail", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "institutions" i
WHERE i."primaryContactName" IS NOT NULL;

-- AlterTable (after backfill)
ALTER TABLE "institutions" DROP COLUMN "chaplainEmail",
DROP COLUMN "chaplainName",
DROP COLUMN "chaplainPhone",
DROP COLUMN "primaryContactEmail",
DROP COLUMN "primaryContactName",
DROP COLUMN "primaryContactPhone",
DROP COLUMN "primaryContactRole";
