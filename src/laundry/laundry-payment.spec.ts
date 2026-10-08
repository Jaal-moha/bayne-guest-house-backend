import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { LaundryService } from './laundry.service';

describe('laundry payment ownership', () => {
  it('moves the payment amount with a laundry price change', async () => {
    const tx = {
      laundry: { update: jest.fn().mockResolvedValue({ id: 1, price: 200 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      laundry: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, price: 120 }),
        update: tx.laundry.update,
      },
      payment: tx.payment,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    await new LaundryService(prisma as unknown as PrismaService).update(1, {
      price: 200,
    });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { laundryId: 1 },
      data: { amount: 200 },
    });
  });

  it('refuses a separate payment for a laundry order', async () => {
    const prisma = {
      laundry: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 3, guestId: 2, price: 120, payment: null }),
      },
      payment: { create: jest.fn() },
    };
    const payments = new PaymentsService(prisma as unknown as PrismaService);
    await expect(
      payments.create({
        serviceType: 'LAUNDRY',
        laundryId: 3,
        guestId: 2,
        method: 'cash',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
