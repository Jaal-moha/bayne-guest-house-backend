<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Rooms API

- Create room: POST `/rooms` { number: string, type: string, price: number }
- List rooms: GET `/rooms`
- Get room: GET `/rooms/:id`
- Update room: PATCH `/rooms/:id` with any of { number?, type?, price? }
- Delete room: DELETE `/rooms/:id`

Notes:

- Auth required: JWT with roles. Update/delete require `admin` or `manager` roles; read requires `admin`, `manager`, or `reception`.
- Validation: `number` and `type` min length 3; `price` >= 500.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# test coverage
$ npm run test:cov
```

## Deploy

The planned production setup runs the Docker image on the owner's machine, with a Cloudflare Tunnel exposing it to the internet.

```bash
docker build -t bayne-backend .
docker run -d --name bayne-backend --init --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e DIRECT_URL=postgresql://... \
  -e JWT_SECRET=... \
  -e ALLOWED_ORIGINS='["https://frontend.example.com"]' \
  -e PORT=3000 \
  bayne-backend
```

`DATABASE_URL` and `DIRECT_URL` usually hold the same connection string. Prisma runs migrations over `DIRECT_URL`, so it must bypass any connection pooler. `ALLOWED_ORIGINS` is a JSON array of frontend origins. Set `ATTENDANCE_API_KEY` too if the attendance scanner authenticates with `x-api-key`.

`-p 127.0.0.1:3000:3000` publishes the API on the host's loopback only, so other machines on the LAN can't reach it and all outside traffic comes through the tunnel. `--init` runs a small init process as PID 1 that reaps zombie processes and forwards signals.

The container runs `npm run start:prod`, which applies pending migrations with `prisma migrate deploy` and then starts the server. If a migration fails, the process exits non-zero before the server starts. Read the error with `docker logs bayne-backend`.

Prisma records a failed migration in `_prisma_migrations`. Every later start then stops at error P3009, so the container restarts in a loop until someone resolves it. To recover, check what the migration left in the database and fix it by hand. Then mark the migration, using the same image and the same `-e` flags:

```bash
docker run --rm -e DATABASE_URL=... -e DIRECT_URL=... bayne-backend \
  npx prisma migrate resolve --rolled-back <migration_name>
```

Use `--rolled-back` if you undid the migration's changes. The next start runs it again, so rebuild the image with a fixed migration first. Use `--applied` if you finished the migration by hand. `docker logs` shows the migration name.

Point the tunnel's public hostname at the API:

- cloudflared runs on the host: use `http://localhost:3000`.
- cloudflared runs in a container: `localhost` there is the cloudflared container itself. Put both containers on one user-defined network (`docker network create bayne`, then `--network bayne` on both `docker run` commands) and use `http://bayne-backend:3000`. Docker resolves the container name on that network. The `-p` flag isn't needed in this case.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
