/*
  Warnings:

  - You are about to drop the column `status` on the `Hypothesis` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Hypothesis` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Hypothesis_status_idx";

-- DropIndex
DROP INDEX "Hypothesis_type_idx";

-- AlterTable
ALTER TABLE "Hypothesis" DROP COLUMN "status",
DROP COLUMN "type",
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "HypothesisStatus";

-- DropEnum
DROP TYPE "HypothesisType";

-- CreateIndex
CREATE INDEX "Hypothesis_isArchived_idx" ON "Hypothesis"("isArchived");
