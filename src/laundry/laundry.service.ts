import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LaundryStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLaundryDto } from './dto/create-laundry.dto';
import { UpdateLaundryDto } from './dto/update-laundry.dto';

const isLaundryStatus = (value: string): value is LaundryStatus =>
  (Object.values(LaundryStatus) as string[]).includes(value);

@Injectable()
export class LaundryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLaundryDto) {
    // Ensure guest exists
    const guest = await this.prisma.guest.findUnique({ where: { id: dto.guestId } });
    if (!guest) throw new NotFoundException('Guest not found');

    const priceNum = dto.price ?? 0;

    // Transaction: create laundry and corresponding payment
    const result = await this.prisma.$transaction(async (tx) => {
      const laundry = await tx.laundry.create({
        data: {
          guestId: dto.guestId,
          items: dto.items,
          status: dto.status,
          price: priceNum,
        },
        include: { guest: true },
      });

      // Create payment linked to laundry (paid by default; method cash)
      await tx.payment.create({
        data: {
          laundryId: laundry.id,
          guestId: laundry.guestId, // ← strict guest link
          amount: priceNum,
          method: 'cash',
          status: 'paid',
          serviceType: 'LAUNDRY' as any,
          description: 'Laundry charge',
        },
      });

      return laundry;
    });

    return result;
  }

  /**
   * Optional filters:
   *  - status: a LaundryStatus, anything else is ignored
   *  - q: search in items or guest name
   *  - guestId: number
   */
  async findAll(params: { status?: string; q?: string; guestId?: number }) {
    const { status, q, guestId } = params || {};
    const where: Prisma.LaundryWhereInput = {};

    if (status && isLaundryStatus(status)) {
      where.status = status;
    }
    if (guestId) {
      where.guestId = Number(guestId);
    }
    if (q && q.trim()) {
      where.OR = [
        { items: { contains: q, mode: 'insensitive' } },
        { guest: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.laundry.findMany({
      where,
      include: { guest: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const row = await this.prisma.laundry.findUnique({
      where: { id },
      include: { guest: true },
    });
    if (!row) throw new NotFoundException('Laundry not found');
    return row;
  }

  async update(id: number, dto: UpdateLaundryDto) {
    // Ensure record exists
    const existing = await this.prisma.laundry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Laundry not found');

    // Allow updating price if provided (optional)
    const patch: Prisma.LaundryUpdateInput = {
      ...(dto.items !== undefined ? { items: dto.items } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    if (dto.price !== undefined) patch.price = dto.price;

    return this.prisma.$transaction(async (tx) => {
      const laundry = await tx.laundry.update({ where: { id }, data: patch, include: { guest: true } });
      if (dto.price !== undefined) {
        await tx.payment.updateMany({ where: { laundryId: id }, data: { amount: dto.price } });
      }
      return laundry;
    });
  }

  async updateStatus(id: number, status: LaundryStatus) {
    const existing = await this.prisma.laundry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Laundry not found');

    return this.prisma.laundry.update({
      where: { id },
      data: { status },
      include: { guest: true },
    });
  }

  remove(id: number) {
    return this.prisma.$transaction(async (tx) => {
      // Postgres re-checks a DELETE's WHERE against a row a concurrent request just
      // updated, so a payment marked paid mid-request is skipped here, not deleted.
      await tx.payment.deleteMany({
        where: { laundryId: id, status: { not: PaymentStatus.paid } },
      });
      const laundry = await tx.laundry.findUnique({ where: { id }, include: { payment: true } });
      if (!laundry) throw new NotFoundException('Laundry not found');
      if (laundry.payment) {
        throw new ConflictException(
          'This laundry order is paid. Refund its payment first, then delete the order.',
        );
      }
      return tx.laundry.delete({ where: { id } });
    });
  }
}
