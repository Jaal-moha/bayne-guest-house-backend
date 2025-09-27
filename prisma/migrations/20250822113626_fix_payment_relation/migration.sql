/*
  Warnings:

  - You are about to drop the column `paymentId` on the `Booking` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'manager', 'reception', 'housekeeping', 'barista', 'security', 'finance', 'store');

-- DropIndex
DROP INDEX "public"."Booking_paymentId_key";

-- AlterTable
ALTER TABLE "public"."Booking" DROP COLUMN "paymentId";

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");
