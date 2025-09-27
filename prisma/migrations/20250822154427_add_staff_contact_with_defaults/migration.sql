-- AlterTable
ALTER TABLE "public"."Staff" ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "role" "public"."Role" NOT NULL DEFAULT 'reception';
