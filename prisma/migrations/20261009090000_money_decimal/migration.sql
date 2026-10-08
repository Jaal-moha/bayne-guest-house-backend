-- Refuse any amount that DECIMAL(12, 2) would round, so the deploy fails before a row changes.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('%s %s = %s', t, id, v), ', ') INTO bad FROM (
    SELECT 'Room' AS t, id, price AS v FROM "Room"
    UNION ALL SELECT 'Payment', id, amount FROM "Payment"
    UNION ALL SELECT 'Laundry', id, price FROM "Laundry"
  ) money
  WHERE v IN ('NaN', 'Infinity', '-Infinity') OR v::numeric <> round(v::numeric, 2);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Money values with fractions of a cent: %', bad;
  END IF;
END $$;

ALTER TABLE "Room" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Laundry" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);
