-- CreateTable
CREATE TABLE "ExpenseUpdateOperation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "operationKey" VARCHAR(64) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "appliedVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseUpdateOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseUpdateOperation_expenseId_idx" ON "ExpenseUpdateOperation"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseUpdateOperation_userId_operationKey_key" ON "ExpenseUpdateOperation"("userId", "operationKey");

-- AddForeignKey
ALTER TABLE "ExpenseUpdateOperation" ADD CONSTRAINT "ExpenseUpdateOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseUpdateOperation" ADD CONSTRAINT "ExpenseUpdateOperation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
