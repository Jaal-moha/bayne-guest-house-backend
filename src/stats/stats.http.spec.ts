import { validationPipeOptions } from '../validation';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

process.env.JWT_SECRET = 'stats-test-secret';

describe('GET /stats/series', () => {
  let app: INestApplication;
  const stats = { series: jest.fn().mockResolvedValue([]) };
  const jwt = new JwtService({ secret: 'stats-test-secret' });
  const get = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${jwt.sign({ sub: 1, role: 'admin' })}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [StatsController],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: StatsService, useValue: stats },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  it('defaults to 7 days when days is omitted', async () => {
    await get('/stats/series').expect(200);
    expect(stats.series).toHaveBeenCalledWith(7);
  });

  it('passes an explicit days through as a number', async () => {
    await get('/stats/series?days=14').expect(200);
    expect(stats.series).toHaveBeenCalledWith(14);
  });

  it('rejects a non-numeric days', async () => {
    await get('/stats/series?days=abc').expect(400);
    expect(stats.series).not.toHaveBeenCalled();
  });
});
