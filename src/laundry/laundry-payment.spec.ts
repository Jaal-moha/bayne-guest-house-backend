import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { LaundryService } from './laundry.service';

describe('laundry payment ownership', () => {
  const laundryTx = () => {
    const tx = {
      laundry: { update: jest.fn().mockResolvedValue({ id: 1, price: 200 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      laundry: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, price: 120 }),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return {
      tx,
      service: new LaundryService(prisma as unknown as PrismaService),
    };
  };

  it('keeps the payment amount equal to the price whatever its status, in the same transaction', async () => {
    const { tx, service } = laundryTx();
    await service.update(1, { price: 200 });
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { laundryId: 1 },
      data: { amount: 200 },
    });
  });

  it('leaves the payment alone when the price does not change', async () => {
    const { tx, service } = laundryTx();
    await service.update(1, { status: 'done' });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
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

  describe('deleting a laundry order', () => {
    const removal = (payment: { status: string } | null) => {
      const tx = {
        payment: {
          deleteMany: jest.fn().mockResolvedValue({
            count: payment && payment.status !== 'paid' ? 1 : 0,
          }),
        },
        laundry: {
          findUnique: jest.fn().mockResolvedValue({
            id: 5,
            payment: payment?.status === 'paid' ? payment : null,
          }),
          delete: jest.fn().mockResolvedValue({ id: 5 }),
        },
      };
      const prisma = {
        laundry: { delete: jest.fn().mockResolvedValue({ id: 5 }) },
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      };
      return {
        prisma,
        tx,
        service: new LaundryService(prisma as unknown as PrismaService),
      };
    };

    it('refuses with 409 and deletes nothing while the payment is paid', async () => {
      const { prisma, tx, service } = removal({ status: 'paid' });
      const attempt = service.remove(5);
      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow(/refund/i);
      expect(prisma.laundry.delete).not.toHaveBeenCalled();
      expect(tx.laundry.delete).not.toHaveBeenCalled();
    });

    it('guards the payment delete on its status in the same statement, so a payment marked paid mid-request survives', async () => {
      const { tx, service } = removal({ status: 'unpaid' });
      await service.remove(5);
      expect(tx.payment.deleteMany).toHaveBeenCalledWith({
        where: { laundryId: 5, status: { not: 'paid' } },
      });
    });

    it.each(['unpaid', 'refunded', 'failed'])(
      'deletes the order and its %s payment',
      async (status) => {
        const { tx, service } = removal({ status });
        await expect(service.remove(5)).resolves.toEqual({ id: 5 });
        expect(tx.laundry.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      },
    );

    it('answers 404 for an order that does not exist', async () => {
      const { tx, service } = removal(null);
      tx.laundry.findUnique.mockResolvedValue(null);
      await expect(service.remove(5)).rejects.toThrow(NotFoundException);
      expect(tx.laundry.delete).not.toHaveBeenCalled();
    });
  });

  describe('a laundry payment through /payments', () => {
    const prisma = {
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 7, serviceType: 'LAUNDRY', amount: 120 }),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const payments = new PaymentsService(prisma as unknown as PrismaService);
    beforeEach(() => jest.clearAllMocks());

    it('cannot change its amount', async () => {
      await expect(payments.update(7, { amount: 1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('can still change its status, for a refund', async () => {
      await payments.update(7, { status: 'refunded' });
      expect(prisma.payment.update).toHaveBeenCalled();
    });

    it('accepts an unchanged amount but never writes it, so a concurrent price change wins', async () => {
      await payments.update(7, { amount: 120, status: 'refunded' });
      expect(prisma.payment.update.mock.calls[0][0].data).toEqual({
        status: 'refunded',
      });
    });

    it('still lets a dining payment change amount and be deleted', async () => {
      prisma.payment.findUnique.mockResolvedValueOnce({
        id: 8,
        serviceType: 'DINING',
        amount: 250,
      });
      prisma.payment.findUnique.mockResolvedValueOnce({
        id: 8,
        serviceType: 'DINING',
        amount: 300,
      });
      await payments.update(8, { amount: 300 });
      await payments.remove(8);
      expect(prisma.payment.update).toHaveBeenCalled();
      expect(prisma.payment.delete).toHaveBeenCalled();
    });

    it('cannot be deleted on its own', async () => {
      await expect(payments.remove(7)).rejects.toThrow(BadRequestException);
      expect(prisma.payment.delete).not.toHaveBeenCalled();
    });
  });
});
