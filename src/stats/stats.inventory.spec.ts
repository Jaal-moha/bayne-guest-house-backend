import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from './stats.service';

describe('StatsService inventory figures', () => {
  const rows = [
    { id: 1, quantity: 1, minThreshold: 5, archivedAt: null },
    { id: 2, quantity: 0, minThreshold: 5, archivedAt: new Date('2026-10-01') },
  ];
  const matching = (args?: { where?: { archivedAt?: null } }) =>
    rows.filter((r) => args?.where?.archivedAt !== null || r.archivedAt === null);
  const zero = { count: jest.fn().mockResolvedValue(0) };
  const prisma = {
    room: zero,
    guest: zero,
    staff: zero,
    laundry: zero,
    booking: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    payment: {
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    inventory: {
      count: jest.fn(async (args) => matching(args).length),
      findMany: jest.fn(async (args) => matching(args)),
    },
  };

  it('leaves archived items out of the item and low-stock counts', async () => {
    const stats = await new StatsService(prisma as unknown as PrismaService).overview();
    expect(stats).toMatchObject({ inventory: 1, lowStockCount: 1 });
  });
});
