# Attendance scan

A scanner at the door reads a staff member's barcode. The first scan of the Addis Ababa day (UTC+3) checks them in, the second checks them out, and later scans report that they already checked out.

## Sub-features

- `scan-checkin` creates the day's attendance row with `checkIn=now`.
- `scan-checkout` sets `checkOut=now` on that row.
- `scan-done` returns `ALREADY_CHECKED_OUT` without changing the row.
- `scan-auth` accepts an `x-api-key` header or a bearer JWT with a staff role, and returns 401 without either.
- `scan-prefix` strips `ATT:` and `STAFF-` prefixes from scanned codes.

## How to get to it (user POV)

- `POST /attendance/scan` with `{"code":"<barcode>"}` and either `x-api-key: verify-attendance-key` or a bearer token.
- `GET /attendance` lists rows with `staff` embedded.

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.

- **Staff with a barcode.** Run `$S call --expect 201 manager POST /staff '{"name":"Dawit Alemu","role":"security","phone":"0911777888"}'` and `CODE=$($S last .barcode)`. `CODE` looks like `EMP-123456`.
- **No credentials.** Run `$S call --expect 401 anon POST /attendance/scan "{\"code\":\"$CODE\"}"`.
- **Check in.** Run `$S call --expect 201 --header 'x-api-key: verify-attendance-key' anon POST /attendance/scan "{\"code\":\"$CODE\"}"`. `$S last .action` prints `CHECK_IN`.
- **Check out with a prefixed code.** Run the same call with `"code":"ATT:$CODE"`. `$S last .action` prints `CHECK_OUT`.
- **Already done.** Run it a third time. `$S last .action` prints `ALREADY_CHECKED_OUT`.
- **Stored row.** Run `$S sql "select count(*), bool_and(\"checkOut\" is not null) from \"Attendance\" a join \"Staff\" s on s.id = a.\"staffId\" where s.barcode = '$CODE'"`. It prints `1|t`.

## Gotchas

- The scan route never verifies the JWT signature. It base64-decodes the payload, so a forged token with `"role":"admin"` is accepted. A 201 from a JWT scan doesn't prove auth works.
- `/attendance` CRUD and all of `/inventory` have no guards. `anon` gets 200 or 201 there.
- The day boundary is midnight UTC+3, which is 21:00 UTC. A run that crosses it creates a second row.
- The `x-api-key` value is the instance's `ATTENDANCE_API_KEY`, which `up` sets to `verify-attendance-key`.
