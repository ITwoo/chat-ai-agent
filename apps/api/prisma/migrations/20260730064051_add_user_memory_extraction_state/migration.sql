-- CreateEnum
CREATE TYPE "UserMemoryExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "memoryExtractedAt" TIMESTAMP(3),
ADD COLUMN     "memoryExtractionError" TEXT,
ADD COLUMN     "memoryExtractionStartedAt" TIMESTAMP(3),
ADD COLUMN     "memoryExtractionStatus" "UserMemoryExtractionStatus";

-- CreateIndex
CREATE INDEX "ChatMessage_memoryExtractionStatus_memoryExtractionStartedA_idx" ON "ChatMessage"("memoryExtractionStatus", "memoryExtractionStartedAt");
