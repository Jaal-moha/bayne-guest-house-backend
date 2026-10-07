-- Merge rows that share (staffId, date) into the lowest id, keeping the
-- earliest check-in and the latest check-out, so the unique index can be built.
WITH grouped AS (
  SELECT "staffId", "date", MIN("id") AS keep_id, MIN("checkIn") AS first_in, MAX("checkOut") AS last_out
  FROM "public"."Attendance"
  GROUP BY "staffId", "date"
  HAVING COUNT(*) > 1
)
UPDATE "public"."Attendance" a
SET "checkIn" = g.first_in, "checkOut" = g.last_out
FROM grouped g
WHERE a."id" = g.keep_id;

DELETE FROM "public"."Attendance" a
USING "public"."Attendance" b
WHERE a."staffId" = b."staffId" AND a."date" = b."date" AND a."id" > b."id";

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_staffId_date_key" ON "public"."Attendance"("staffId", "date");
