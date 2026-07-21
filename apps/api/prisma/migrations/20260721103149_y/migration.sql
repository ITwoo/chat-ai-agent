-- CreateTable
CREATE TABLE "AgentPendingApproval" (
    "id" SERIAL NOT NULL,
    "approvalId" UUID NOT NULL,
    "threadId" VARCHAR(255) NOT NULL,
    "roomId" INTEGER NOT NULL,
    "originUserMessageId" INTEGER NOT NULL,
    "request" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPendingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPendingApproval_approvalId_key" ON "AgentPendingApproval"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPendingApproval_roomId_key" ON "AgentPendingApproval"("roomId");

-- CreateIndex
CREATE INDEX "AgentPendingApproval_threadId_idx" ON "AgentPendingApproval"("threadId");

-- CreateIndex
CREATE INDEX "AgentPendingApproval_originUserMessageId_idx" ON "AgentPendingApproval"("originUserMessageId");

-- AddForeignKey
ALTER TABLE "AgentPendingApproval" ADD CONSTRAINT "AgentPendingApproval_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
