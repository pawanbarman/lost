-- AlterEnum
ALTER TYPE "ClaimStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "handoverStartedAt" TIMESTAMP(3),
ADD COLUMN     "handoverCompletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimantId_reportId_key" ON "Claim"("claimantId", "reportId");

-- CreateIndex
CREATE INDEX "Claim_reportId_status_idx" ON "Claim"("reportId", "status");