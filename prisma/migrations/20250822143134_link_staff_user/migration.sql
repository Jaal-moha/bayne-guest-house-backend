/*
  Warnings:

  - You are about to drop the column `role` on the `Staff` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[staffId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Staff" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "staffId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_staffId_key" ON "public"."User"("staffId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
