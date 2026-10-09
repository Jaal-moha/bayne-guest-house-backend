import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

describe('room payment amount', () => {
  it('charges nights times the room price to the cent', async () => {
    const prisma = {
      booking: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          guestId: 2,
          checkIn: new Date('2026-11-01T12:00:00Z'),
          checkOut: new Date('2026-11-04T12:00:00Z'),
          room: { price: new Prisma.Decimal('500.10') },
          payment: null,
        }),
      },
      payment: { create: jest.fn().mockResolvedValue({}) },
    };
    await new PaymentsService(prisma as unknown as PrismaService).create({
      bookingId: 4,
      method: 'cash',
    } as never);
    expect(Number(prisma.payment.create.mock.calls[0][0].data.amount)).toBe(1500.3);
  });
});
