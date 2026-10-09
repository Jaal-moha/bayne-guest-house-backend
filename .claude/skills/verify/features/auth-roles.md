# Auth and roles

Staff log in with email and password and get a JWT. Each route then loads the user named by the token and allows or refuses the request based on that user's current role. A missing token returns 401 and the wrong role returns 403.

## Sub-features

- `auth-login` returns `{access_token, forceChangePassword}` for valid credentials and 401 for a wrong password.
- `auth-me` returns the decoded user for a valid token.
- `auth-gate` returns 401 without a token and 403 for a role outside a route's `@Roles` list.
- `auth-staff-account` lets a manager create a staff member with a login, which can then log in.
- `auth-change-password` changes the caller's password and clears `forceChangePassword`. While the flag is set, every route except `GET /auth/me` and `POST /auth/change-password` returns 403 with `code: "PASSWORD_CHANGE_REQUIRED"`.

## How to get to it (user POV)

- `POST /auth/login` with `{email, password}`.
- `GET /auth/me` with a bearer token.
- Any guarded route, such as `GET /rooms` or `POST /rooms`.
- `POST /staff` with `username` and `password` (admin or manager).
- `POST /auth/change-password` with `{currentPassword, newPassword}` and a bearer token. It returns 204.

## Driving it with control.sh

Preconditions:

- The baseline from the README holds.

- **Login.** Run `$S call --expect 201 anon POST /auth/login '{"email":"admin@example.com","password":"admin123"}'`. The body has a non-empty `access_token`.
- **Wrong password.** Run `$S call --expect 401 anon POST /auth/login '{"email":"admin@example.com","password":"nope"}'`.
- **Who am I.** Run `$S call --expect 200 reception GET /auth/me`. `$S last .user.role` prints `reception`.
- **No token.** Run `$S call --expect 401 anon GET /rooms`.
- **Wrong role.** Run `$S call --expect 403 reception POST /rooms '{"number":"999","type":"single","price":900}'`.
- **Staff login created by a manager.** Run `$S call --expect 201 manager POST /staff '{"name":"Sara Tesfaye","role":"housekeeping","phone":"0911555666","username":"sara@example.com","password":"sara-pass-1","forceChangePassword":false}'`, then `$S call --expect 201 anon POST /auth/login '{"email":"sara@example.com","password":"sara-pass-1"}'`. Confirm with `$S sql 'select email, role, "staffId" from "User" where email = '"'"'sara@example.com'"'"''`.
- **Forced password change.** Create a staff login without `forceChangePassword` (it defaults to true), log in as `anon`, and keep the token with `T=$($S last .access_token)`. Pass it with `--header "Authorization: Bearer $T"` on `anon` calls. `GET /rooms` returns 403 and `$S last .code` prints `PASSWORD_CHANGE_REQUIRED`. `POST /auth/change-password '{"currentPassword":"wrong-pass","newPassword":"second-pass"}'` returns 400. With the right current password it returns 204, and the same token then gets 200 on `GET /rooms`.

## Gotchas

- Login returns 201, not 200, because it's a Nest `@Post`.
- `$S token <role>` creates a `Verify <role>` staff row the first time it runs for each role. Account for those rows in staff counts.
- Every request reloads the user by the token's `sub`. A role change in `"User"` applies to tokens already issued, and a deleted user's token gets 401. Tokens still expire after 7 days.
- No route changes `"User".role`. `PUT /staff/:id` changes only `"Staff".role`, so demote with `$S sql 'update "User" set role = ...'`.
- `POST /staff` defaults `forceChangePassword` to true. `$S token <role>` passes `forceChangePassword:false`, so role tokens are never blocked. The seeded admin has the flag false.
- bcrypt reads only the first 72 bytes of a password. `newPassword` on `POST /auth/change-password` and `password` on `POST /staff`, `PUT /staff/:id` and `POST /users/staff/:staffId` return 400 `password must be at most 72 bytes` (or `newPassword ...`) above 72 UTF-8 bytes. Login and `currentPassword` have no cap, so an older, longer password still works.
