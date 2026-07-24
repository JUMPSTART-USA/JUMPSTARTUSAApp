// Single import point for the database layer. API code imports PrismaClient,
// model types, and enums from "@jumpstart/database" — never from
// "@prisma/client" directly — so the generated-client location stays an
// implementation detail of this package.
export * from '@prisma/client';
export { PrismaClient, Prisma } from '@prisma/client';
