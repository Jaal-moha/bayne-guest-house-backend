import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('AuthModule config', () => {
  it('signs with a secret only the env file sets, and a blank expiry means 7 days', async () => {
    const envFile = join(mkdtempSync(join(tmpdir(), 'auth-config-')), '.env');
    writeFileSync(envFile, 'JWT_SECRET=from-env-file\nJWT_EXPIRES_IN=\n');
    delete process.env.JWT_SECRET;
    jest.resetModules();

    const { Test } = require('@nestjs/testing');
    const { ConfigModule } = require('@nestjs/config');
    const { JwtService } = require('@nestjs/jwt');
    const { AuthModule } = require('./auth.module');
    const { PrismaService } = require('../prisma/prisma.service');
    const { PrismaModule } = require('../prisma/prisma.module');

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ envFilePath: envFile }),
        PrismaModule,
        AuthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const token = moduleRef.get(JwtService).sign({ sub: 1, role: 'admin' });
    const claims = new JwtService({ secret: 'from-env-file' }).verify(token);
    expect(claims.sub).toBe(1);
    expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
  });
});
