-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('HYPOTHESIS_CREATED', 'HYPOTHESIS_UPDATED', 'CONFIDENCE_CHANGED', 'EVIDENCE_ADDED', 'EVIDENCE_UPDATED', 'TAGS_CHANGED', 'OWNER_CHANGED', 'CHILD_ADDED', 'HYPOTHESIS_ARCHIVED', 'HYPOTHESIS_DELETED');

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "type" "ActivityType" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_hypothesisId_idx" ON "ActivityLog"("hypothesisId");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_idx" ON "ActivityLog"("actorId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
