-- AlterTable
ALTER TABLE "Hypothesis" ADD COLUMN     "execSummaryBigPicture" TEXT,
ADD COLUMN     "execSummaryGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "execSummaryProgress" TEXT,
ADD COLUMN     "execSummaryValidation" TEXT;
