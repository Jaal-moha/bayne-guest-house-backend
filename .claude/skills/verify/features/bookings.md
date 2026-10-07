# Bookings

Reception books a guest into a room for a date range. The API refuses a range that overlaps an existing booking for the same room and can list bookings that are still unpaid.

## Sub-features

- `bookings-create` creates a booking with `guest`, `room` and `payment: null` embedded.
- `bookings-overlap` returns 400 `Room is already booked in this date range` for any overlap on the same room.
- `bookings-update` moves dates or rooms and re-runs the overlap check, excluding the booking itself.
- `bookings-unpaid` returns bookings with no payment or a payment whose status isn't `paid` from `GET /bookings?unpaid=true`.
- `bookings-delete` deletes a booking (admin or manager).

## How to get to it (user POV)

- `POST /bookings` and `PATCH /bookings/:id` (admin, reception or manager).
- `GET /bookings`, `GET /bookings?unpaid=true` and `GET /bookings/:id` (finance can also read).
- `DELETE /bookings/:id` (admin or manager).

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.

- **Room and guest.** Run `$S call --expect 201 admin POST /rooms '{"number":"101","type":"double","price":1500}'` and `ROOM=$($S last .id)`. Then run `$S call --expect 201 reception POST /guests '{"name":"Abebe Kebede","phone":"0911223344"}'` and `GUEST=$($S last .id)`.
- **Book.** Run `$S call --expect 201 reception POST /bookings "{\"guestId\":$GUEST,\"roomId\":$ROOM,\"checkIn\":\"2026-11-01T12:00:00Z\",\"checkOut\":\"2026-11-03T10:00:00Z\"}"` and `BOOKING=$($S last .id)`. `$S last .payment` prints `null`.
- **Overlap refused.** Run the same call with `checkIn` `2026-11-02T12:00:00Z` and `checkOut` `2026-11-04T10:00:00Z` and `--expect 400`.
- **Back-to-back allowed.** Run the same call with `checkIn` `2026-11-03T10:00:00Z` and `checkOut` `2026-11-05T10:00:00Z` and `--expect 201`. The checks use strict `<` and `>`, so ranges that only touch don't overlap.
- **Unpaid list.** Run `$S call --expect 200 finance GET "/bookings?unpaid=true"`. `$S last "any(.[]; .id == $BOOKING)"` prints `true`.
- **Stored row.** Run `$S sql "select \"roomId\",\"guestId\",\"checkIn\",\"checkOut\" from \"Booking\" where id = $BOOKING"`. It prints `<room>|<guest>|2026-11-01 12:00:00|2026-11-03 10:00:00`.
- **Role gate.** Run `$S call --expect 403 housekeeping GET /bookings`.

## Gotchas

- The overlap check and the insert aren't atomic. Two concurrent creates can both succeed. Sequential calls can't show this race, so prove it with parallel calls if a change touches it.
- `guestId` and `roomId` must be JSON numbers. `"1"` returns 400 from validation.
- Deleting a booking that has a payment returns 200. The relation is optional, so Postgres sets `Payment.bookingId` to NULL and leaves a ROOM payment with no booking. Check `"Payment"` with `$S sql` after any delete.
