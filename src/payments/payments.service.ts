import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nights } from '../bookings/nights';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePaymentDto) {
    const serviceType = dto.serviceType ?? (dto.bookingId ? 'ROOM' : 'OTHER');

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
        dto.amount ?? nights(booking.checkIn, booking.checkOut) * (booking.room?.price ?? 0);

      const payment = await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          guestId: booking.guestId, // ← strict guest link
          amount,
          method: dto.method,
          status: dto.status,
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
      throw new BadRequestException('Laundry payments are recorded when the laundry order is created');
    }

    // DINING or OTHER
    const amount = dto.amount;
    if (!Number.isFinite(amount as number) || (amount as number) <= 0) {
      throw new BadRequestException('Amount is required for non-room payments');
    }
    const guestId = dto.guestId;
    if (!guestId) throw new BadRequestException('guestId is required for non-room payments');
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Guest not found');

    return this.prisma.payment.create({
      data: {
        guestId, // ← strict guest link
        amount: amount as number,
        method: dto.method,
        status: dto.status,
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

  private async findLaundryPayment(id: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    return payment?.serviceType === 'LAUNDRY' ? payment : null;
  }

  async update(id: number, dto: UpdatePaymentDto) {
    const laundry = await this.findLaundryPayment(id);
    if (laundry && dto.amount !== undefined && dto.amount !== laundry.amount) {
      throw new BadRequestException('Laundry payments follow their order. Change the price on the laundry order instead');
    }
    return this.prisma.payment.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined && !laundry ? { amount: dto.amount } : {}),
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

  async remove(id: number) {
    if (await this.findLaundryPayment(id)) {
      throw new BadRequestException('Laundry payments follow their order. Delete the laundry order instead');
    }
    return this.prisma.payment.delete({ where: { id } });
  }
}
