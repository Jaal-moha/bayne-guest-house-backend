-- Refuse any value the enums cannot hold, so the deploy fails before a row is touched.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM "Payment"
    WHERE status NOT IN ('paid', 'unpaid', 'Unpaid', 'refunded', 'failed');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Payment.status holds values outside PaymentStatus: %', bad;
  END IF;
  SELECT string_agg(DISTINCT method, ', ') INTO bad FROM "Payment"
    WHERE method NOT IN ('cash', 'card', 'mobile', 'e_birr', 'cbe', 'cbe_birr', 'bank_transfer');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Payment.method holds values outside PaymentMethod: %', bad;
  END IF;
  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM "Laundry"
    WHERE status NOT IN ('pending', 'in_progress', 'done');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Laundry.status holds values outside LaundryStatus: %', bad;
  END IF;
END $$;

UPDATE "Payment" SET status = 'unpaid' WHERE status = 'Unpaid';

CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'mobile', 'e_birr', 'cbe', 'cbe_birr', 'bank_transfer');
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'unpaid', 'refunded', 'failed');
CREATE TYPE "LaundryStatus" AS ENUM ('pending', 'in_progress', 'done');

ALTER TABLE "Payment"
  ALTER COLUMN "method" TYPE "PaymentMethod" USING ("method"::"PaymentMethod"),
  ALTER COLUMN "status" TYPE "PaymentStatus" USING ("status"::"PaymentStatus"),
  ALTER COLUMN "status" SET DEFAULT 'paid';

ALTER TABLE "Laundry"
  ALTER COLUMN "status" TYPE "LaundryStatus" USING ("status"::"LaundryStatus"),
  ALTER COLUMN "status" SET DEFAULT 'pending';
