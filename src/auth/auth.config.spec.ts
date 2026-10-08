import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('AuthModule config', () => {
  it('signs and verifies with a JWT_SECRET that only the env file provides', async () => {
    const envFile = join(mkdtempSync(join(tmpdir(), 'auth-config-')), '.env');
    writeFileSync(envFile, 'JWT_SECRET=from-env-file\n');
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

    const jwt = moduleRef.get(JwtService);
    const token = jwt.sign({ sub: 1, role: 'admin' });
    expect(
      new (require('@nestjs/jwt').JwtService)({
        secret: 'from-env-file',
      }).verify(token).sub,
    ).toBe(1);
  });
});
