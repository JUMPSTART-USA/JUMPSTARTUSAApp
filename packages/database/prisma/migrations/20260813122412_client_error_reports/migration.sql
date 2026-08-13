-- CreateTable
CREATE TABLE "client_errors" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "route" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "viewportW" INTEGER,
    "viewportH" INTEGER,
    "userAgent" TEXT,
    "userId" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_errors_lastSeenAt_idx" ON "client_errors"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_errors_fingerprint_key" ON "client_errors"("fingerprint");

-- AddForeignKey
ALTER TABLE "client_errors" ADD CONSTRAINT "client_errors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
