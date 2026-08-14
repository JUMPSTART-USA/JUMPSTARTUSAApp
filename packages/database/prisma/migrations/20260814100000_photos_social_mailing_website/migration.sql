-- Profile photos (participants/volunteers via persons, donors), social media
-- profile fields, websites for vendors/employers, and mailing addresses with a
-- "same as primary" flag (default true: existing records keep using their
-- primary address for mail until someone says otherwise).

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "mailingAddressLine1" TEXT,
ADD COLUMN     "mailingAddressLine2" TEXT,
ADD COLUMN     "mailingCity" TEXT,
ADD COLUMN     "mailingSameAsPrimary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mailingState" TEXT,
ADD COLUMN     "mailingZip" TEXT,
ADD COLUMN     "photoData" BYTEA,
ADD COLUMN     "photoFileName" TEXT,
ADD COLUMN     "photoMimeType" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "twitterUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- AlterTable
ALTER TABLE "institutions" ADD COLUMN     "mailingAddressLine1" TEXT,
ADD COLUMN     "mailingCity" TEXT,
ADD COLUMN     "mailingSameAsPrimary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mailingState" TEXT,
ADD COLUMN     "mailingZip" TEXT;

-- AlterTable
ALTER TABLE "donors" ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "mailingAddressLine1" TEXT,
ADD COLUMN     "mailingCity" TEXT,
ADD COLUMN     "mailingSameAsPrimary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mailingState" TEXT,
ADD COLUMN     "mailingZip" TEXT,
ADD COLUMN     "photoData" BYTEA,
ADD COLUMN     "photoFileName" TEXT,
ADD COLUMN     "photoMimeType" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "twitterUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "mailingAddressLine1" TEXT,
ADD COLUMN     "mailingCity" TEXT,
ADD COLUMN     "mailingSameAsPrimary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mailingState" TEXT,
ADD COLUMN     "mailingZip" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "employers" ADD COLUMN     "website" TEXT;
