/*
  Warnings:

  - A unique constraint covering the columns `[storageKey]` on the table `RagDocument` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `storageKey` to the `RagDocument` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RagDocument" ADD COLUMN     "storageKey" VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RagDocument_storageKey_key" ON "RagDocument"("storageKey");
