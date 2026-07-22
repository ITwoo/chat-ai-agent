-- CreateEnum
CREATE TYPE "RagDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "RagDocument" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "RagDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagDocumentChunk" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagDocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RagDocument_userId_idx" ON "RagDocument"("userId");

-- CreateIndex
CREATE INDEX "RagDocument_userId_status_idx" ON "RagDocument"("userId", "status");

-- CreateIndex
CREATE INDEX "RagDocument_createdAt_idx" ON "RagDocument"("createdAt");

-- CreateIndex
CREATE INDEX "RagDocumentChunk_documentId_idx" ON "RagDocumentChunk"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "RagDocumentChunk_documentId_chunkIndex_key" ON "RagDocumentChunk"("documentId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagDocumentChunk" ADD CONSTRAINT "RagDocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "RagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
