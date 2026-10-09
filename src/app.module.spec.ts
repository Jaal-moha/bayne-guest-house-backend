import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule', () => {
  const savedSecret = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterAll(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it('resolves every provider in the real module graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
