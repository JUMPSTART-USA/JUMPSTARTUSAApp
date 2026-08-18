-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signInSuspendedAt" TIMESTAMP(3),
ADD COLUMN     "signInSuspendedById" TEXT;

