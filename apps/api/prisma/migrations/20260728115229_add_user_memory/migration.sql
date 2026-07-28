-- CreateEnum
CREATE TYPE "UserMemoryType" AS ENUM ('PROFILE', 'PREFERENCE', 'GOAL', 'CONSTRAINT');

-- CreateEnum
CREATE TYPE "UserMemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "UserMemoryType" NOT NULL,
    "memoryKey" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "UserMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceMessageId" INTEGER,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMemory_userId_status_idx" ON "UserMemory"("userId", "status");

-- CreateIndex
CREATE INDEX "UserMemory_userId_type_status_idx" ON "UserMemory"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "UserMemory_sourceMessageId_idx" ON "UserMemory"("sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_memoryKey_key" ON "UserMemory"("userId", "memoryKey");

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
