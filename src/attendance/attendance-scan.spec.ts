import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceScanController } from './attendance-scan.controller';

describe('POST /attendance/scan race', () => {
  let app: INestApplication;
  const staff = {
    id: 4,
    name: 'Dawit',
    role: 'security',
    barcode: 'EMP-123456',
  };
  const winner = {
    id: 9,
    staffId: 4,
    checkIn: new Date('2026-10-08T05:00:00Z'),
    checkOut: null,
  };
  const prisma = {
    staff: { findUnique: jest.fn().mockResolvedValue(staff) },
    attendance: { findUnique: jest.fn().mockResolvedValue(winner) },
    $transaction: jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      ),
  };

  beforeAll(async () => {
    process.env.ATTENDANCE_API_KEY = 'test-key';
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceScanController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'test-secret' }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('reports a check-in with the existing row when a concurrent scan inserted it first', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/scan')
      .set('x-api-key', 'test-key')
      .send({ code: staff.barcode })
      .expect(201);
    expect(res.body.action).toBe('CHECK_IN');
    expect(res.body.attendance.id).toBe(winner.id);
  });
});
