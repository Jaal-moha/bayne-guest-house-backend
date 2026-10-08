import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

const ALREADY_BOOKED = 'Room is already booked in this date range';

// The Booking_room_no_overlap exclusion constraint catches a concurrent booking that passed assertNoOverlap.
function rethrowOverlap(error: unknown): never {
  if (error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes('Booking_room_no_overlap')) {
    throw new BadRequestException(ALREADY_BOOKED);
  }
  throw error;
}

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  private async assertNoOverlap(roomId: number, checkIn: Date, checkOut: Date, excludeId?: number) {
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        roomId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        AND: [
          { checkIn: { lt: checkOut } },
          { checkOut: { gt: checkIn } },
        ],
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new BadRequestException(ALREADY_BOOKED);
    }
  }

  async create(dto: CreateBookingDto) {
    const checkIn = new Date(dto.checkIn as any);
    const checkOut = new Date(dto.checkOut as any);
    if (!(checkIn instanceof Date) || isNaN(checkIn.getTime())) throw new BadRequestException('Invalid checkIn');
    if (!(checkOut instanceof Date) || isNaN(checkOut.getTime())) throw new BadRequestException('Invalid checkOut');
    if (checkIn >= checkOut) throw new BadRequestException('checkIn must be before checkOut');

    await this.assertNoOverlap(dto.roomId, checkIn, checkOut);

    return this.prisma.booking
      .create({
        data: {
          guestId: dto.guestId,
          roomId: dto.roomId,
          checkIn,
          checkOut,
        },
        include: { guest: true, room: true, payment: true },
      })
      .catch(rethrowOverlap);
  }

  findAll() {
    return this.prisma.booking.findMany({
      include: { guest: true, room: true, payment: true },
      orderBy: { id: 'desc' },
    });
  }

  /**
   * Unpaid = either no payment record OR payment exists but status !== 'paid'
   */
  findAllUnpaid() {
    return this.prisma.booking.findMany({
      where: {
        OR: [
          { payment: null },
          { payment: { is: { status: { not: 'paid' } } } },
        ],
      },
      include: { guest: true, room: true, payment: true },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const b = await this.prisma.booking.findUnique({
      where: { id },
      include: { guest: true, room: true, payment: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  async update(id: number, dto: UpdateBookingDto) {
    const existing = await this.prisma.booking.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Booking not found');

    const roomId = dto.roomId ?? existing.roomId;
    const checkIn = dto.checkIn ? new Date(dto.checkIn as any) : existing.checkIn;
    const checkOut = dto.checkOut ? new Date(dto.checkOut as any) : existing.checkOut;

    if (checkIn >= checkOut) throw new BadRequestException('checkIn must be before checkOut');

    await this.assertNoOverlap(roomId, checkIn, checkOut, id);

    return this.prisma.booking
      .update({
        where: { id },
        data: {
          guestId: dto.guestId ?? existing.guestId,
          roomId,
          checkIn,
          checkOut,
        },
        include: { guest: true, room: true, payment: true },
      })
      .catch(rethrowOverlap);
  }

  remove(id: number) {
    return this.prisma.booking.delete({ where: { id } });
  }
}
