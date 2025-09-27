import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  private calcNights(checkIn: Date, checkOut: Date) {
    const ms = checkOut.getTime() - checkIn.getTime();
    const nights = Math.floor(ms / 86_400_000);
    return nights <= 0 ? 1 : nights; // minimum 1 night
  }

  async create(dto: CreatePaymentDto) {
    const anyDto = dto as any;
    const serviceTypeRaw: string | undefined = anyDto.serviceType;
    const serviceType = (serviceTypeRaw || (dto.bookingId ? 'ROOM' : 'OTHER')).toUpperCase();

    if (serviceType === 'ROOM') {
      if (!dto.bookingId) throw new BadRequestException('bookingId is required for ROOM payments');
      // Booking must exist
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        include: { room: true, guest: true, payment: true },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      // No duplicate payment per booking
      if (booking.payment) throw new BadRequestException('Payment already exists for this booking');

      const amount =
        dto.amount ?? this.calcNights(booking.checkIn, booking.checkOut) * (booking.room?.price ?? 0);

      const payment = await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          guestId: booking.guestId, // ← strict guest link
          amount,
          method: dto.method,
          status: dto.status ?? 'paid',
          description: dto.description ?? null,
          serviceType: 'ROOM' as any,
        },
        include: {
          booking: { include: { guest: true, room: true } },
          laundry: { include: { guest: true } },
          guest: true,
        } as any, // ← cast include
      });
      return payment;
    }

    if (serviceType === 'LAUNDRY') {
      const laundryId: number | undefined = anyDto.laundryId ? Number(anyDto.laundryId) : undefined;
      if (!laundryId) throw new BadRequestException('laundryId is required for LAUNDRY payments');

      const laundry = await this.prisma.laundry.findUnique({
        where: { id: laundryId },
        include: { guest: true, payment: true },
      });
      if (!laundry) throw new NotFoundException('Laundry not found');
      if (laundry.payment) throw new BadRequestException('Payment already exists for this laundry');

      const amount = dto.amount ?? laundry.price ?? 0;
      if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('Invalid amount');

      return this.prisma.payment.create({
        data: {
          laundryId,
          guestId: laundry.guestId, // ← strict guest link
          amount,
          method: dto.method,
          status: dto.status ?? 'paid',
          description: dto.description ?? null,
          serviceType: 'LAUNDRY' as any,
        },
        include: {
          booking: { include: { guest: true, room: true } },
          laundry: { include: { guest: true } },
          guest: true,
        } as any, // ← cast include
      });
    }

    // DINING or OTHER
    const amount = dto.amount;
    if (!Number.isFinite(amount as number) || (amount as number) <= 0) {
      throw new BadRequestException('Amount is required for non-room payments');
    }
    const guestId = (anyDto.guestId != null) ? Number(anyDto.guestId) : undefined;
    if (!guestId) throw new BadRequestException('guestId is required for non-room payments');
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Guest not found');

    return this.prisma.payment.create({
      data: {
        guestId, // ← strict guest link
        amount: amount as number,
        method: dto.method,
        status: dto.status ?? 'paid',
        description: dto.description ?? null,
        serviceType: (serviceType === 'DINING' ? 'DINING' : 'OTHER') as any,
      },
      include: {
        booking: { include: { guest: true, room: true } },
        laundry: { include: { guest: true } },
        guest: true,
      } as any, // ← cast include
    });
  }

  findAll() {
    return this.prisma.payment.findMany({
      include: {
        booking: { include: { guest: true, room: true } },
        laundry: { include: { guest: true } },
        guest: true, // ← include direct guest
      } as any, // ← cast include
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        booking: { include: { guest: true, room: true } },
        laundry: { include: { guest: true } },
        guest: true,
      } as any, // ← cast include
    });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  update(id: number, dto: UpdatePaymentDto) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.method ? { method: dto.method } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      },
      include: {
        booking: { include: { guest: true, room: true } },
        laundry: { include: { guest: true } },
        guest: true,
      } as any, // ← cast include
    });
  }

  remove(id: number) {
    return this.prisma.payment.delete({ where: { id } });
  }
}
