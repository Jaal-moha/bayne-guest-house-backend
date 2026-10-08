import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService stock changes', () => {
  const make = (found: boolean, count: number) => {
    const tx = {
      inventory: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        findUnique: jest
          .fn()
          .mockResolvedValue(found ? { id: 3, quantity: 0 } : null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 3, quantity: 4 }),
      },
      inventoryMovement: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return {
      tx,
      service: new InventoryService(prisma as unknown as PrismaService),
    };
  };

  it('takes stock out only where enough remains, in one statement', async () => {
    const { tx, service } = make(true, 1);
    await service.moveOut(3, 2, 'bar');
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { id: 3, quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
  });

  it('reports insufficient stock without writing a movement', async () => {
    const { tx, service } = make(true, 0);
    await expect(service.moveOut(3, 2)).rejects.toThrow(BadRequestException);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('adds stock in one statement and reports a missing item as 404', async () => {
    const { tx, service } = make(false, 0);
    await expect(service.moveIn(3, 2)).rejects.toThrow(NotFoundException);
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { id: 3, quantity: { lte: 2147483647 - 2 } },
      data: { quantity: { increment: 2 } },
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('refuses an IN that would push the quantity past the column maximum', async () => {
    const { tx, service } = make(true, 0);
    await expect(service.moveIn(3, 2)).rejects.toThrow(BadRequestException);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('sets the quantity in one statement and reports a missing item as 404', async () => {
    const { tx, service } = make(false, 0);
    await expect(service.adjust(3, 5)).rejects.toThrow(NotFoundException);
    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { quantity: 5 },
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe('InventoryService reads', () => {
  const prisma = {
    inventory: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 3 }),
    },
    inventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
  };
  const service = new InventoryService(prisma as unknown as PrismaService);

  it('lists movements newest first by insert order', async () => {
    await service.movements(3, 200);
    expect(prisma.inventoryMovement.findMany.mock.calls[0][0].orderBy).toEqual({
      id: 'desc',
    });
  });

  const lastQuery = () => {
    const [sql, ...values] = prisma.$queryRaw.mock.calls.at(-1);
    return { sql: sql.join('?'), values };
  };

  it('searches in one statement, matching quantity as a substring like the old filter', async () => {
    prisma.$queryRaw.mockClear();
    prisma.inventory.findMany.mockClear();
    await service.findAll({ q: '12' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.inventory.findMany).not.toHaveBeenCalled();
    const { sql, values } = lastQuery();
    expect(sql).toMatch(/quantity::text LIKE/i);
    expect(values).toContain('%12%');
  });

  it('treats % and _ in the search text literally', async () => {
    await service.findAll({ q: '50%_off' });
    expect(lastQuery().values).toContain('%50\\%\\_off%');
  });

  it('applies the low-stock filter to the rows the query returns', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 1, quantity: 2, minThreshold: 5 },
      { id: 2, quantity: 9, minThreshold: 5 },
    ]);
    expect(await service.findAll({ low: true })).toEqual([{ id: 1, quantity: 2, minThreshold: 5 }]);
  });
});
