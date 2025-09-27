-- ...existing migration steps that add enum PaymentServiceType, laundryId, price, etc...

-- 1) Add guestId as nullable first (safe for existing rows)
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "guestId" INTEGER;

-- 2) Backfill from related Booking
UPDATE "Payment" p
SET "guestId" = b."guestId"
FROM "Booking" b
WHERE p."bookingId" = b."id" AND p."guestId" IS NULL;

-- 3) Optionally backfill from Laundry if Payment.laundryId exists (guarded for shadow DB)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Payment'
      AND column_name = 'laundryId'
  ) THEN
    UPDATE "Payment" p
    SET "guestId" = l."guestId"
    FROM "Laundry" l
    WHERE p."laundryId" = l."id" AND p."guestId" IS NULL;
  END IF;
END $$;

-- 4) Safety check: fail migration if any NULL guestId remains
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "guestId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill failed: some payments have no guest link; fix data then re-run migration';
  END IF;
END $$;

-- 5) Enforce NOT NULL and FK after backfill
ALTER TABLE "Payment" ALTER COLUMN "guestId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Payment_guestId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_guestId_fkey"
      FOREIGN KEY ("guestId") REFERENCES "Guest"("id")
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- ...existing migration steps (uniques on bookingId/laundryId)...
