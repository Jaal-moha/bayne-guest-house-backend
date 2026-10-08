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
      where: { id: 3 },
      data: { quantity: { increment: 2 } },
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

  it('matches a numeric search against the quantity, as the old filter did', async () => {
    await service.findAll({ q: '12' });
    const or = prisma.inventory.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toContainEqual({ quantity: 12 });
  });
});
