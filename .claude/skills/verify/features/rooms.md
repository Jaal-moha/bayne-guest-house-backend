# Rooms and availability

Managers maintain the room list with a number, type and nightly price. Reception searches for rooms that are free across a date range before booking.

## Sub-features

- `rooms-create` creates a room. `number` and `type` need at least 3 characters and `price` must be at least 500.
- `rooms-list` lists rooms sorted by number.
- `rooms-update` changes any field (admin or manager).
- `rooms-delete` deletes a room (admin or manager).
- `rooms-available` returns rooms with no booking that overlaps `[checkIn, checkOut)`.

## How to get to it (user POV)

- `POST /rooms`, `GET /rooms`, `GET /rooms/:id`, `PATCH /rooms/:id`, `DELETE /rooms/:id`.
- `GET /rooms/available?checkIn=<iso>&checkOut=<iso>` (admin, manager or reception).

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.

- **Create.** Run `$S call --expect 201 manager POST /rooms '{"number":"201","type":"twin","price":1200}'`, then `ROOM=$($S last .id)`.
- **Validation.** Run `$S call --expect 400 manager POST /rooms '{"number":"2","type":"tw","price":100}'`. The body's `message` array names all three fields.
- **Reception can read.** Run `$S call --expect 200 reception GET /rooms/$ROOM`. `$S last .price` prints `1200`.
- **Update.** Run `$S call --expect 200 manager PATCH /rooms/$ROOM '{"price":1300}'`, then `$S call --expect 200 reception GET /rooms/$ROOM`. `$S last .price` prints `1300`.
- **Available when free.** Run `$S call --expect 200 reception GET "/rooms/available?checkIn=2026-12-01T12:00:00Z&checkOut=2026-12-03T10:00:00Z"`. `$S last "any(.[]; .id == $ROOM)"` prints `true`.
- **Hidden when booked.** Create a guest and a booking for that range (see [bookings](./bookings.md)), then repeat the availability call. `$S last "any(.[]; .id == $ROOM)"` exits `1` with `FAIL last`.

## Gotchas

- `GET /rooms/:id` for a missing id returns 200 with an empty body, not 404.
- `price` is a float column. Compare it as a number, and expect `1200` rather than `1200.00`.
- An invalid date or `checkIn >= checkOut` on `/rooms/available` returns 400.
