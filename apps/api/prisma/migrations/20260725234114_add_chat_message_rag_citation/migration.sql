-- CreateTable
CREATE TABLE "ChatMessageRagCitation" (
    "id" SERIAL NOT NULL,
    "chatMessageId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "chunkId" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRagCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessageRagCitation_chatMessageId_idx" ON "ChatMessageRagCitation"("chatMessageId");

-- AddForeignKey
ALTER TABLE "ChatMessageRagCitation" ADD CONSTRAINT "ChatMessageRagCitation_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
