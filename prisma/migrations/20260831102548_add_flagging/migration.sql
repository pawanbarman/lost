-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "flaggedReason" TEXT,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false;
