-- AlterTable
ALTER TABLE "webauthn_credentials" ADD COLUMN     "discoverable" BOOLEAN,
ADD COLUMN     "userVerified" BOOLEAN;

