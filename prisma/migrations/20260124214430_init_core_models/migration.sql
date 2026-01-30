-- CreateEnum
CREATE TYPE "HypothesisType" AS ENUM ('FOUNDATIONAL', 'STRATEGY', 'PRODUCT', 'UX', 'GROWTH', 'TECH', 'MARKET');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('PROPOSED', 'IN_TESTING', 'SUPPORTED', 'REFUTED', 'DEPRECATED', 'SPLIT');

-- CreateEnum
CREATE TYPE "EvidenceDirection" AS ENUM ('SUPPORTS', 'WEAKLY_SUPPORTS', 'NEUTRAL', 'WEAKLY_REFUTES', 'REFUTES');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('EXPERIMENT', 'RESEARCH', 'DATA_ANALYSIS', 'EXTERNAL', 'OPS');

-- CreateEnum
CREATE TYPE "RefutationType" AS ENUM ('COUNTEREXAMPLE', 'ALTERNATIVE_HYPOTHESIS', 'EVIDENCE_CRITIQUE', 'SCOPE_MISMATCH');

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "type" "HypothesisType" NOT NULL,
    "status" "HypothesisStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "impactScore" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypothesisEdge" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HypothesisEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "direction" "EvidenceDirection" NOT NULL,
    "strength" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL DEFAULT 3,
    "summary" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "ownerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refutation" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "type" "RefutationType" NOT NULL,
    "summary" TEXT NOT NULL,
    "proposedTest" TEXT,
    "impact" TEXT,
    "ownerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hypothesis_status_idx" ON "Hypothesis"("status");

-- CreateIndex
CREATE INDEX "Hypothesis_type_idx" ON "Hypothesis"("type");

-- CreateIndex
CREATE INDEX "HypothesisEdge_parentId_idx" ON "HypothesisEdge"("parentId");

-- CreateIndex
CREATE INDEX "HypothesisEdge_childId_idx" ON "HypothesisEdge"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "HypothesisEdge_parentId_childId_key" ON "HypothesisEdge"("parentId", "childId");

-- CreateIndex
CREATE INDEX "Evidence_hypothesisId_idx" ON "Evidence"("hypothesisId");

-- CreateIndex
CREATE INDEX "Evidence_kind_idx" ON "Evidence"("kind");

-- CreateIndex
CREATE INDEX "Refutation_hypothesisId_idx" ON "Refutation"("hypothesisId");

-- CreateIndex
CREATE INDEX "Refutation_type_idx" ON "Refutation"("type");

-- AddForeignKey
ALTER TABLE "HypothesisEdge" ADD CONSTRAINT "HypothesisEdge_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypothesisEdge" ADD CONSTRAINT "HypothesisEdge_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refutation" ADD CONSTRAINT "Refutation_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
