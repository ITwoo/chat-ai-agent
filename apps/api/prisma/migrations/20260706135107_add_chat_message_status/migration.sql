-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "status" "ChatMessageStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateIndex
CREATE INDEX "ChatMessage_status_idx" ON "ChatMessage"("status");
