-- AlterEnum
ALTER TYPE "UserMemoryStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "UserMemory" ADD COLUMN     "deletedAt" TIMESTAMP(3);
