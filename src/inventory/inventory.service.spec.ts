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
  };
  const service = new InventoryService(prisma as unknown as PrismaService);

  it('lists movements newest first by insert order', async () => {
    await service.movements(3, 200);
    expect(prisma.inventoryMovement.findMany.mock.calls[0][0].orderBy).toEqual({
      id: 'desc',
    });
  });

  it('matches a numeric search against the exact quantity', async () => {
    await service.findAll({ q: '12' });
    const or = prisma.inventory.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toContainEqual({ quantity: 12 });
  });

  it('adds no quantity clause for a number the column cannot hold', async () => {
    await service.findAll({ q: '4006381333931' });
    const where = prisma.inventory.findMany.mock.calls.at(-1)[0].where;
    expect(JSON.stringify(where)).not.toContain('quantity');
  });
});
