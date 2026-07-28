-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summaryThroughMessageId" INTEGER,
ADD COLUMN     "summaryUpdatedAt" TIMESTAMP(3);
