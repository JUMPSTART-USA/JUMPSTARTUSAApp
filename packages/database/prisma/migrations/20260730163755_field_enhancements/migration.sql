-- CreateEnum
CREATE TYPE "Race" AS ENUM ('american_indian_alaska_native', 'asian', 'black_african_american', 'native_hawaiian_pacific_islander', 'white', 'two_or_more', 'unspecified');

-- CreateEnum
CREATE TYPE "HomeGender" AS ENUM ('male', 'female', 'any');

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "race" "Race" NOT NULL DEFAULT 'unspecified';

-- AlterTable
ALTER TABLE "transitional_homes" ADD COLUMN     "gender" "HomeGender" NOT NULL DEFAULT 'any',
ADD COLUMN     "sexOffenderApproved" BOOLEAN NOT NULL DEFAULT false;

-- Data: fold legacy inside-class types into the new fixed menu
-- (Pre-Release / Character / Other): reentry → pre_release, everything else
-- not in the menu → other.
UPDATE "inside_classes" SET "classType" = 'pre_release' WHERE "classType" = 'reentry';
UPDATE "inside_classes" SET "classType" = 'character' WHERE "classType" = 'character';
UPDATE "inside_classes" SET "classType" = 'other'
WHERE "classType" IS NOT NULL AND "classType" NOT IN ('pre_release', 'character', 'other');
