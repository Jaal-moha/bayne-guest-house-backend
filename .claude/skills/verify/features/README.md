# Guest-house API verification map

This directory is the maintained source for verifying the user-facing behavior of the guest-house API. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `$S up` printed `READY` and `$S doctor` printed `DOCTOR PASS`, with `S=.claude/skills/verify/scripts/control.sh` run from the repo root.
- The database starts empty except for the seeded `admin@example.com` user. Every recipe creates its own rooms, guests and staff, and reads ids back with `$S last .id`. Never hardcode ids.
- Never drive an instance this run didn't `up`.

## Driving conventions

- Every step is one `$S call --expect <code> …` line. The exit code is the assertion, so stop at the first non-zero exit.
- Call each route as the role a real user would have. Use `admin` only where the route allows only admin.
- Dates are ISO-8601 UTC strings. Use dates in the future so they don't collide with today-based stats.
- Recipes mutate data. To start from a clean baseline, run `$S down && $S up`.

## Proof and skip reporting

- Capture the action and a second, independent read of the result (`GET` or `$S sql`).
- For auth or validation changes, include the 401, 403 or 400 case.
- Report the evidence file paths. A route you couldn't reach is reported with the command and the output line, not as verified through a different route.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then has exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control.sh`, and `Gotchas`.

## Features

- [Auth and roles](./auth-roles.md) covers login, `/auth/me`, and the 401/403 role gates every controller shares.
- [Rooms and availability](./rooms.md) covers room CRUD, its validation, and the availability search.
- [Bookings](./bookings.md) covers booking creation, overlap rejection, updates, and the unpaid filter.
- [Payments and laundry](./payments-laundry.md) covers room payments, laundry orders, and the payment each laundry order creates automatically.
- [Attendance scan](./attendance-scan.md) covers staff check-in and check-out by barcode with an API key or JWT.
