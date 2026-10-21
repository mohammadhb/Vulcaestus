-- CreateEnum
CREATE TYPE "BatchKind" AS ENUM ('SCORE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED');

-- DropIndex
DROP INDEX "Job_canonicalUrl_key";

-- DropIndex
DROP INDEX "Job_fingerprint_key";

-- DropIndex
DROP INDEX "Job_discoveredAt_idx";

-- DropIndex
DROP INDEX "Job_companyNormalized_idx";

-- DropIndex
DROP INDEX "Job_title_idx";

-- DropIndex
DROP INDEX "Job_deletedAt_idx";

-- AlterTable (nullable first, then backfill to the earliest profile for legacy rows)
ALTER TABLE "Job" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "profileId" UUID;

UPDATE "Job"
SET "profileId" = (SELECT "id" FROM "CandidateProfile" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "profileId" IS NULL;

-- Jobs cannot exist without an owner. A fresh install has no rows here.
DELETE FROM "Job" WHERE "profileId" IS NULL;

ALTER TABLE "Job" ALTER COLUMN "profileId" SET NOT NULL;

-- CreateTable
CREATE TABLE "BatchRun" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "kind" "BatchKind" NOT NULL DEFAULT 'SCORE',
    "status" "BatchStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "request" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatchRun_profileId_status_createdAt_idx" ON "BatchRun"("profileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_profileId_discoveredAt_idx" ON "Job"("profileId", "discoveredAt");

-- CreateIndex
CREATE INDEX "Job_profileId_companyNormalized_idx" ON "Job"("profileId", "companyNormalized");

-- CreateIndex
CREATE INDEX "Job_profileId_archivedAt_idx" ON "Job"("profileId", "archivedAt");

-- CreateIndex
CREATE INDEX "Job_profileId_deletedAt_idx" ON "Job"("profileId", "deletedAt");

-- CreateIndex
CREATE INDEX "Job_profileId_title_idx" ON "Job"("profileId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Job_profileId_canonicalUrl_key" ON "Job"("profileId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Job_profileId_fingerprint_key" ON "Job"("profileId", "fingerprint");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRun" ADD CONSTRAINT "BatchRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

