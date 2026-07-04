/*
  Warnings:

  - You are about to alter the column `title` on the `Board` table. The data in that column could be lost. The data in that column will be cast from `VarChar` to `VarChar(100)`.
  - The `status` column on the `Board` table will be converted from text/varchar to BoardStatus enum.
  - You are about to rename the column `updateAt` on the `ChatRoom` table to `updatedAt`.
  - You are about to alter the column `title` on the `ChatRoom` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `username` on the `User` table. The data in that column could be lost. The data in that column will be cast from `VarChar` to `VarChar(50)`.
  - You are about to alter the column `password` on the `User` table. The data in that column could be lost. The data in that column will be cast from `VarChar` to `VarChar(255)`.
*/

-- CreateEnum
CREATE TYPE "BoardStatus" AS ENUM ('PUBLIC', 'PRIVATE');

-- 기존 status 값이 enum에 없는 값이면 enum 변환이 실패하므로 보정
UPDATE "Board"
SET "status" = 'PUBLIC'
WHERE "status" NOT IN ('PUBLIC', 'PRIVATE');

-- userId를 필수로 바꿀 것이므로 작성자 없는 게시글은 제거
-- 개발 DB 기준. 살려야 하는 데이터면 삭제하지 말고 userId를 특정 사용자로 채워야 함.
DELETE FROM "Board"
WHERE "userId" IS NULL;

-- DropForeignKey
ALTER TABLE "Board" DROP CONSTRAINT "FK_c9951f13af7909d37c0e2aec484";

-- Rename constraints
ALTER TABLE "Board" RENAME CONSTRAINT "PK_865a0f2e22c140d261b1df80eb1" TO "Board_pkey";

ALTER TABLE "User" RENAME CONSTRAINT "PK_cace4a159ff9f2512dd42373760" TO "User_pkey";

-- Alter Board
ALTER TABLE "Board"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "title" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "description" SET DATA TYPE TEXT,
ALTER COLUMN "userId" SET NOT NULL;

-- Board.status: varchar -> enum
ALTER TABLE "Board" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Board"
ALTER COLUMN "status" TYPE "BoardStatus" USING "status"::"BoardStatus",
ALTER COLUMN "status" SET DEFAULT 'PUBLIC',
ALTER COLUMN "status" SET NOT NULL;

-- Prisma @updatedAt는 Prisma Client가 넣어주므로 DB default는 제거
ALTER TABLE "Board" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Alter ChatRoom
ALTER TABLE "ChatRoom" RENAME COLUMN "updateAt" TO "updatedAt";

ALTER TABLE "ChatRoom"
ALTER COLUMN "title" SET DATA TYPE VARCHAR(100);

-- Alter User
ALTER TABLE "User"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "username" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "password" SET DATA TYPE VARCHAR(255);

-- Prisma @updatedAt는 Prisma Client가 넣어주므로 DB default는 제거
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Board_userId_idx" ON "Board"("userId");

-- CreateIndex
CREATE INDEX "Board_status_idx" ON "Board"("status");

-- CreateIndex
CREATE INDEX "Board_createdAt_idx" ON "Board"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatRoom_updatedAt_idx" ON "ChatRoom"("updatedAt");

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "UQ_78a916df40e02a9deb1c4b75edb" RENAME TO "User_username_key";