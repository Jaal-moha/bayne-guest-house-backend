import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';

describe('AttendanceService manual rows', () => {
  const addisDayStart = new Date('2026-10-07T21:00:00.000Z');
  const prisma = { attendance: { create: jest.fn(), update: jest.fn() } };
  const service = new AttendanceService(prisma as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());

  it.each(['2026-10-08', '2026-10-08T00:00:00Z', '2026-10-08T20:59:00Z'])(
    'stores %s under the Addis day start the scan uses',
    async (date) => {
      await service.create({
        staffId: 4,
        date,
        checkIn: '2026-10-08T05:00:00Z',
      });
      expect(prisma.attendance.create.mock.calls[0][0].data.date).toEqual(
        addisDayStart,
      );
    },
  );

  it('moves a row to the Addis day start on update', async () => {
    await service.update(1, { date: '2026-10-08' });
    expect(prisma.attendance.update.mock.calls[0][0].data.date).toEqual(
      addisDayStart,
    );
  });

  it('reports a second row for the same staff day as a conflict', async () => {
    prisma.attendance.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.create({
        staffId: 4,
        date: '2026-10-08',
        checkIn: '2026-10-08T05:00:00Z',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
