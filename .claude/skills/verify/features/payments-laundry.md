# Payments and laundry

Front desk and finance record payments against a booking, a laundry order, or a guest directly. Housekeeping logs laundry orders, and every new laundry order immediately creates its own `paid` cash payment.

## Sub-features

- `pay-room` creates a ROOM payment for a booking. If `amount` is omitted it computes `floor(nights) * room.price`, with a minimum of 1 night.
- `pay-room-duplicate` returns 400 for a second payment on the same booking.
- `pay-other` creates a DINING or OTHER payment, which requires `guestId` and a positive `amount`.
- `laundry-create` creates a laundry order and, in the same transaction, a `LAUNDRY` payment with `status=paid`, `method=cash` and `amount=price`.
- `laundry-status` moves an order through `pending`, `in_progress` and `done`.

## How to get to it (user POV)

- `POST /payments`, `GET /payments`, `GET /payments/:id`, `PATCH /payments/:id`, `DELETE /payments/:id` (admin, finance, manager or reception).
- `POST /laundry` (admin, housekeeping, reception or manager), `PATCH /laundry/:id/status` (admin, housekeeping or manager), and `GET /laundry?status=&q=&guestId=`.

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.
- A room with `price` 1500, a guest `$GUEST`, and a booking `$BOOKING` from `2026-11-01T12:00:00Z` to `2026-11-03T10:00:00Z`, built with the [bookings](./bookings.md) recipe.

- **Room payment.** Run `$S call --expect 201 reception POST /payments "{\"bookingId\":$BOOKING,\"method\":\"cash\"}"`. `$S last .amount` prints `1500`, because 46 hours rounds down to 1 night. `$S last .serviceType` prints `ROOM`.
- **Booking now paid.** Run `$S call --expect 200 finance GET "/bookings?unpaid=true"`. `$S last "any(.[]; .id == $BOOKING)"` exits `1`.
- **Duplicate refused.** Repeat the room payment call with `--expect 400`.
- **Other payment.** Run `$S call --expect 201 finance POST /payments "{\"serviceType\":\"DINING\",\"guestId\":$GUEST,\"amount\":250,\"method\":\"card\"}"`.
- **Laundry order.** Run `$S call --expect 201 housekeeping POST /laundry "{\"guestId\":$GUEST,\"items\":\"2x towels\",\"price\":120}"` and `LAUNDRY=$($S last .id)`. `$S last .status` prints `pending`.
- **Auto payment side effect.** Run `$S sql "select \"serviceType\", status, method, amount from \"Payment\" where \"laundryId\" = $LAUNDRY"`. It prints `LAUNDRY|paid|cash|120`.
- **Status flow.** Run `$S call --expect 200 housekeeping PATCH /laundry/$LAUNDRY/status '{"status":"done"}'`, then `$S call --expect 400 housekeeping PATCH /laundry/$LAUNDRY/status '{"status":"lost"}'`.

## Gotchas

- Bodies are validated and transformed, so numeric strings arrive as numbers and a blank amount counts as missing. An unknown `method` or `status` gets 400.
- `POST /payments` with `serviceType: LAUNDRY` returns 400 while the order's payment exists, because `POST /laundry` created it. After `DELETE /payments/:id` removes that payment, it returns 201. PR #9 rejects both.
- Until PR #9 merges, changing a laundry order's `price` doesn't update its payment amount. Check both rows with `$S sql`.
- `/stats/overview` counts nights with `ceil`, so its `unpaidTotal` can disagree with what `POST /payments` charges. Issue #17 tracks this.
