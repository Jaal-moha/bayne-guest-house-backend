import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from './bookings.service';

describe('BookingsService overlap race', () => {
  const overlap = () =>
    new Prisma.PrismaClientUnknownRequestError(
      'conflicting key value violates exclusion constraint "Booking_room_no_overlap"',
      { clientVersion: 'test' },
    );
  const stay = {
    guestId: 1,
    roomId: 2,
    checkIn: '2026-11-01T12:00:00Z',
    checkOut: '2026-11-03T10:00:00Z',
  };
  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 5,
          guestId: 1,
          roomId: 2,
          checkIn: new Date(),
          checkOut: new Date(),
        }),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new BookingsService(prisma as unknown as PrismaService);

  it('reports a booking that loses the race as already booked', async () => {
    prisma.booking.create.mockRejectedValueOnce(overlap());
    await expect(service.create(stay as never)).rejects.toThrow(
      new BadRequestException('Room is already booked in this date range'),
    );
  });

  it('reports an update that loses the race as already booked', async () => {
    prisma.booking.update.mockRejectedValueOnce(overlap());
    await expect(
      service.update(5, {
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
      } as never),
    ).rejects.toThrow(
      new BadRequestException('Room is already booked in this date range'),
    );
  });
});
