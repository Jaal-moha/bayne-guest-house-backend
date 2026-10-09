import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { DecimalToNumberInterceptor } from './decimal-to-number.interceptor';

@Controller('money')
class MoneyController {
  @Get()
  get() {
    return {
      amount: new Prisma.Decimal('1500.30'),
      createdAt: new Date('2026-11-01T12:00:00Z'),
      booking: { room: { price: new Prisma.Decimal('500.10'), number: '302' } },
      rows: [{ price: new Prisma.Decimal('0.10') }, { price: null }],
    };
  }

  @Get('list')
  list() {
    return [{ amount: new Prisma.Decimal('19.99') }];
  }
}

describe('Decimal fields over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MoneyController],
      providers: [{ provide: APP_INTERCEPTOR, useClass: DecimalToNumberInterceptor }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('sends money as JSON numbers and leaves other values alone', async () => {
    const res = await request(app.getHttpServer()).get('/money').expect(200);
    expect(res.body).toEqual({
      amount: 1500.3,
      createdAt: '2026-11-01T12:00:00.000Z',
      booking: { room: { price: 500.1, number: '302' } },
      rows: [{ price: 0.1 }, { price: null }],
    });
  });

  it('converts inside a top-level array', async () => {
    const res = await request(app.getHttpServer()).get('/money/list').expect(200);
    expect(res.body).toEqual([{ amount: 19.99 }]);
  });

  it('runs on every route of the app', () => {
    expect(Reflect.getMetadata('providers', AppModule)).toContainEqual({
      provide: APP_INTERCEPTOR,
      useClass: DecimalToNumberInterceptor,
    });
  });
});
