-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_laundryId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_laundryId_fkey" FOREIGN KEY ("laundryId") REFERENCES "public"."Laundry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
