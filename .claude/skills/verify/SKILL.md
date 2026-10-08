---
name: verify
description: Boot the Bayne guest-house NestJS API against a disposable local Postgres and call its HTTP endpoints with real role JWTs, capturing every request and response as evidence. Use to prove a backend change works before calling it done, or to reproduce an API bug. Recipes cover auth and roles, rooms, bookings, payments, laundry and the attendance scan; other routes are driven with the same `call` and `sql` commands.
---

# Verify the guest-house API

The surface is a JSON HTTP API (NestJS 11, Prisma 6, Postgres). There is no UI in this repo. Everything goes through one script, which prints fixed-format lines and exits `0` on success and `1` on failure. Branch on the exit code and the first word of each line, never on prose.

```bash
S=.claude/skills/verify/scripts/control.sh   # run from the repo root
```

## Launch

```bash
$S up
```

It installs deps if `node_modules` is missing, runs `prisma generate`, starts a fresh Postgres 16 cluster on a free port, runs `prisma migrate deploy`, seeds the admin user, runs `npm run build`, and starts `node dist/src/main` on another free port. Expect these outputs.

- `READY base=http://127.0.0.1:<port> id=<id> rev=<git-sha>[-dirty-<hash>] evidence=<dir>` means it's up. Use that `base` and nothing else. The hash covers every change under `src` and `prisma`, untracked files included, so a second edit to a dirty tree still shows as stale.
- `FAIL <step> log=<path>` means it isn't. Read the named log. Steps: `npm-ci`, `prisma-generate`, `install-postgres`, `hydrate-postgres`, `initdb`, `postgres-start`, `createdb`, `migrate`, `seed`, `build`, `server-exited`, `health-timeout`.

`up` is idempotent. If a healthy instance exists it prints `READY` again and reuses its database. If the instance is stale it tears it down and starts over. Postgres comes from the `@embedded-postgres/linux-x64` npm binaries installed under `.verify/tools/`, so Docker isn't needed.

Code changes need a rebuild. `up` won't rebuild a healthy instance, so after editing `src/` or `prisma/` run `$S down && $S up`. `doctor` prints `STALE build-rev` when the running build is older than the working tree.

Parallel instances need `VERIFY_ID=<name>` on every command and a worktree each. Each id gets its own ports, database, run dir and evidence dir, but `up` builds into the checkout's shared `dist/` and Prisma client, so two ids in one checkout rebuild under each other. Never drive an instance whose `up` you didn't run.

## Doctor

```bash
$S doctor
```

It's read-only. It prints `OK|FAIL <check>` for `postgres`, `server-pid`, `port-owner` (the port belongs to our pid), `health`, and `admin-login`, then `OK|STALE build-rev`, then `DOCTOR PASS base=…` or `DOCTOR FAIL`. Run it first whenever something looks off. On `DOCTOR FAIL`, run `$S down && $S up`.

## Drive

```bash
$S token <role>                         # prints only the JWT
$S call [--expect CODE] [--header 'K: V'] <role|anon> <METHOD> <PATH> ['<json>']
$S last [jq-path]                       # value from the last call's response body
$S sql "<query>"                        # read the database directly
```

- **Roles.** `admin`, `manager`, `reception`, `housekeeping`, `barista`, `security`, `finance`, `store`. `anon` sends no token. `admin` logs in as the seeded `admin@example.com` / `admin123`. Any other role is created the way a manager would do it. The script calls `POST /staff` as admin with `username=verify-<role>@example.com` and `password=verify-pass-<role>`, then logs in through `POST /auth/login`. Tokens are cached per instance.
- **`call` output.** Line 1 is `HTTP <code>`, line 2 is `EVIDENCE <file>`, line 3 is the response body as compact JSON. When the server can't be reached, it prints `FAIL http-unreachable` and exits `1` without writing evidence, so a dead server never passes as a response. With `--expect`, a final `EXPECT OK <code>` exits `0` and `EXPECT FAIL want=<a> got=<b>` exits `1`. Always pass `--expect` so the exit code carries the assertion.
- **Chaining ids.** `ID=$($S last .id)` reads the last `call`'s body. A filter whose result is `false`, `null` or missing prints `FAIL last …` and exits `1`, so `$S last "any(.[]; .id == $ID)"` works as a membership assertion. Use jq paths such as `.id`, `.[0].id`, or `.payment.status`.
- **`sql` output.** Line 1 is `EVIDENCE <file>`, then one row per line with `|`-separated columns and no header. Prisma models are case-sensitive tables, so double-quote them: `"Booking"`, `"Payment"`, `"roomId"`.

Routes, role rules and request shapes are in [`features/`](features/README.md). Start there.

## Evidence

Every `call` and `sql` writes a numbered JSON file to `.verify/evidence/<id>/<UTC-timestamp>/`. A `call` file holds the role, method, path, headers, request body, status and response body. A `sql` file holds the query and the rows. `down` copies `server.log` and `postgres.log` into the same directory. Evidence is never deleted by the script. `.verify/` is gitignored.

A proof needs all of these.
- The real route, called as the role that would use it. Never insert rows with `sql` to fake the action.
- The action's response plus a second, independent read of the result: a `GET` of the resource, or a `sql` row check for side effects such as a Payment row created by a laundry order.
- The negative case when the change touches auth or validation. Use `anon` for 401, a disallowed role for 403, and a bad body for 400.
- Cite the evidence files in your report.

## Cleanup

```bash
$S down
```

It kills only the pid recorded at `up`, after checking that its cmdline is `dist/src/main`. It stops the Postgres cluster with `pg_ctl`, deletes the run dir and database, and prints `DOWN ok evidence=<dir>`. Evidence survives. It's safe to run when nothing is up and prints `DOWN nothing-running`. Run it after every session, including failed `up` attempts: it also stops a cluster that a failed `up` left running. If the server or the cluster refuses to stop, it prints `FAIL server-stop` or `FAIL postgres-stop` and keeps the run dir.

## Helpers

- `scripts/control.sh` is the only helper. It needs `node`, `npm`, `curl`, `jq`, `psql`, `pg_isready` and `ss`, all on this machine.
- Fixed values the instance uses: `JWT_SECRET=verify-jwt-secret` and `ATTENDANCE_API_KEY=verify-attendance-key`.
