# Auth and roles

Staff log in with email and password and get a JWT. Each route then allows or refuses the request based on the role inside that token. A missing token returns 401 and the wrong role returns 403.

## Sub-features

- `auth-login` returns `{access_token}` for valid credentials and 401 for a wrong password.
- `auth-me` returns the decoded user for a valid token.
- `auth-gate` returns 401 without a token and 403 for a role outside a route's `@Roles` list.
- `auth-staff-account` lets a manager create a staff member with a login, which can then log in.

## How to get to it (user POV)

- `POST /auth/login` with `{email, password}`.
- `GET /auth/me` with a bearer token.
- Any guarded route, such as `GET /rooms` or `POST /rooms`.
- `POST /staff` with `username` and `password` (admin or manager).

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.

- **Login.** Run `$S call --expect 201 anon POST /auth/login '{"email":"admin@example.com","password":"admin123"}'`. The body has a non-empty `access_token`.
- **Wrong password.** Run `$S call --expect 401 anon POST /auth/login '{"email":"admin@example.com","password":"nope"}'`.
- **Who am I.** Run `$S call --expect 200 reception GET /auth/me`. `$S last .user.role` prints `reception`.
- **No token.** Run `$S call --expect 401 anon GET /rooms`.
- **Wrong role.** Run `$S call --expect 403 reception POST /rooms '{"number":"999","type":"single","price":900}'`.
- **Staff login created by a manager.** Run `$S call --expect 201 manager POST /staff '{"name":"Sara Tesfaye","role":"housekeeping","phone":"0911555666","username":"sara@example.com","password":"sara-pass-1","forceChangePassword":false}'`, then `$S call --expect 201 anon POST /auth/login '{"email":"sara@example.com","password":"sara-pass-1"}'`. Confirm with `$S sql 'select email, role, "staffId" from "User" where email = '"'"'sara@example.com'"'"''`.

## Gotchas

- Login returns 201, not 200, because it's a Nest `@Post`.
- `$S token <role>` creates a `Verify <role>` staff row the first time it runs for each role. Account for those rows in staff counts.
- The role lives inside the JWT for 7 days. Changing a user's role in the database doesn't affect a token that's already been issued, so call `$S down && $S up` for a clean slate.
- `forceChangePassword` is stored but login never reads it. A flag set to `true` doesn't block login.
