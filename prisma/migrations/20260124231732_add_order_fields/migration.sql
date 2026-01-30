-- AlterTable
ALTER TABLE "Hypothesis" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HypothesisEdge" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Hypothesis_order_idx" ON "Hypothesis"("order");
