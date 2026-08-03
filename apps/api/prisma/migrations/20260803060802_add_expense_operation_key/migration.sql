/*
  Warnings:

  - A unique constraint covering the columns `[userId,operationKey]` on the table `Expense` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `operationKey` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense"
ADD COLUMN "operationKey" VARCHAR(64);

UPDATE "Expense"
SET "operationKey" = 'legacy:' || "id";

ALTER TABLE "Expense"
ALTER COLUMN "operationKey" SET NOT NULL;
-- CreateIndex
CREATE UNIQUE INDEX "Expense_userId_operationKey_key"
ON "Expense" ("userId", "operationKey");