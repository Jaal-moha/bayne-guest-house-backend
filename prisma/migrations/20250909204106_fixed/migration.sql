/*
  Warnings:

  - A unique constraint covering the columns `[laundryId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."PaymentServiceType" AS ENUM ('ROOM', 'LAUNDRY', 'DINING', 'OTHER');

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_bookingId_fkey";

-- AlterTable
ALTER TABLE "public"."Laundry" ADD COLUMN     "price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "laundryId" INTEGER,
ADD COLUMN     "serviceType" "public"."PaymentServiceType" NOT NULL DEFAULT 'ROOM',
ALTER COLUMN "bookingId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_laundryId_key" ON "public"."Payment"("laundryId");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_laundryId_fkey" FOREIGN KEY ("laundryId") REFERENCES "public"."Laundry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
