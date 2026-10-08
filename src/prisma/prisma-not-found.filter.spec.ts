import { Controller, Delete, INestApplication, Param } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaNotFoundFilter } from './prisma-not-found.filter';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', {
    code,
    clientVersion: 'test',
  });

@Controller('things')
class ThingsController {
  @Delete(':code')
  remove(@Param('code') code: string) {
    throw prismaError(code);
  }
}

describe('PrismaNotFoundFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
      providers: [{ provide: APP_FILTER, useClass: PrismaNotFoundFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('turns a missing record into 404', async () => {
    const res = await request(app.getHttpServer())
      .delete('/things/P2025')
      .expect(404);
    expect(res.body.message).toBe('Record not found');
  });

  it('leaves other Prisma errors as 500', async () => {
    await request(app.getHttpServer()).delete('/things/P2003').expect(500);
  });
});
