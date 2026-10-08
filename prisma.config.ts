// Prisma stops loading .env once a config file exists, so load it here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
