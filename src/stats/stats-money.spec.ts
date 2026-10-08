import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from './stats.service';

describe('stats money', () => {
  const statsWith = (roomPrice: string, paidSum: string) => {
    const prisma = {
      room: { count: jest.fn().mockResolvedValue(1) },
      booking: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            checkIn: new Date('2026-11-01T12:00:00Z'),
            checkOut: new Date('2026-11-04T12:00:00Z'),
            room: { price: new Prisma.Decimal(roomPrice) },
          },
        ]),
      },
      guest: { count: jest.fn().mockResolvedValue(1) },
      payment: {
        count: jest.fn().mockResolvedValue(3),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(paidSum) } }),
      },
      inventory: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      staff: { count: jest.fn().mockResolvedValue(0) },
      laundry: { count: jest.fn().mockResolvedValue(0) },
    };
    return new StatsService(prisma as unknown as PrismaService);
  };

  it('totals unpaid nights to the cent', async () => {
    const overview = await statsWith('500.10', '0.30').overview();
    expect(Number(overview.unpaidTotal)).toBe(1500.3);
  });
});
