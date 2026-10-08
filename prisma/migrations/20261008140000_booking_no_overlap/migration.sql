-- Prisma's schema cannot express an exclusion constraint, so it lives only here.
-- Stays are half-open, [checkIn, checkOut), matching BookingsService.assertNoOverlap.
-- This fails if the table already holds overlapping bookings for a room.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Fail fast instead of queueing booking traffic behind the lock if a long transaction holds the table.
SET lock_timeout = '10s';

ALTER TABLE "public"."Booking"
  ADD CONSTRAINT "Booking_room_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, tsrange("checkIn", "checkOut") WITH &&);
