import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
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
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'queueMicrotask',
      ],
    });
    jest.setSystemTime(new Date('2026-10-08T05:00:00Z'));
    process.env.ATTENDANCE_API_KEY = 'test-key';
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceScanController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: JwtStrategy, useValue: {} },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: 'test-secret' }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    jest.useRealTimers();
    await app.close();
  });

  it('reports a check-in with the existing row when a concurrent scan inserted it first', async () => {
    const res = await request(app.getHttpServer())
      .post('/attendance/scan')
      .set('x-api-key', 'test-key')
      .send({ code: staff.barcode })
      .expect(201);
    expect(res.body.action).toBe('CHECK_IN');
    expect(res.body.attendance.id).toBe(winner.id);
    expect(prisma.attendance.findUnique).toHaveBeenCalledWith({
      where: {
        staffId_date: {
          staffId: staff.id,
          date: new Date('2026-10-07T21:00:00.000Z'),
        },
      },
    });
  });

  it('reports the winner as already checked out when it has a check-out', async () => {
    prisma.attendance.findUnique.mockResolvedValueOnce({
      ...winner,
      checkOut: new Date('2026-10-08T04:00:00Z'),
    });
    const res = await request(app.getHttpServer())
      .post('/attendance/scan')
      .set('x-api-key', 'test-key')
      .send({ code: staff.barcode })
      .expect(201);
    expect(res.body.action).toBe('ALREADY_CHECKED_OUT');
  });

  it('does not report a check-in when the unique violation has no matching row', async () => {
    prisma.attendance.findUnique.mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer())
      .post('/attendance/scan')
      .set('x-api-key', 'test-key')
      .send({ code: staff.barcode })
      .expect(500);
    expect(res.body.action).toBeUndefined();
  });
});
