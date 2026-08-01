-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "data" BYTEA,
ALTER COLUMN "fileKey" DROP NOT NULL;
