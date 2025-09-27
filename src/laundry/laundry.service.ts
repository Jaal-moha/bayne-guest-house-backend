import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLaundryDto } from './dto/create-laundry.dto';
import { UpdateLaundryDto } from './dto/update-laundry.dto';

const ALLOWED_STATUSES = ['pending','in_progress','done'] as const;
type LaundryStatus = typeof ALLOWED_STATUSES[number];

@Injectable()
export class LaundryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateLaundryDto) {
    // Ensure guest exists
    const guest = await this.prisma.guest.findUnique({ where: { id: dto.guestId } });
    if (!guest) throw new NotFoundException('Guest not found');

    const status: LaundryStatus = dto.status && ALLOWED_STATUSES.includes(dto.status as any)
      ? dto.status as LaundryStatus
      : 'pending';

    // Accept price from DTO (backward compatible)
    const rawPrice = (dto as any).price;
    const priceNum = rawPrice === undefined || rawPrice === null ? 0 : Number(rawPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new BadRequestException('Price must be a non-negative number');
    }

    // Transaction: create laundry and corresponding payment
    const result = await this.prisma.$transaction(async (tx) => {
      const laundry = await tx.laundry.create({
        data: {
          guestId: dto.guestId,
          items: dto.items,
          status,
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
   *  - status: 'pending' | 'in_progress' | 'done'
   *  - q: search in items or guest name
   *  - guestId: number
   */
  async findAll(params: { status?: string; q?: string; guestId?: number }) {
    const { status, q, guestId } = params || {};
    const where: any = {};

    if (status && ['pending', 'in_progress', 'done'].includes(status)) {
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

    if (dto.status !== undefined && !ALLOWED_STATUSES.includes(dto.status as any)) {
      throw new BadRequestException('Status must be one of: pending, in_progress, done');
    }

    // Allow updating price if provided (optional)
    const patch: any = {
      ...(dto.items !== undefined ? { items: dto.items } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    if ((dto as any).price !== undefined) {
      const p = Number((dto as any).price);
      if (!Number.isFinite(p) || p < 0) throw new BadRequestException('Price must be a non-negative number');
      patch.price = p;
    }

    return this.prisma.laundry.update({
      where: { id },
      data: patch,
      include: { guest: true },
    });
  }

  async updateStatus(id: number, status: string) {
    if (!ALLOWED_STATUSES.includes(status as any)) {
      throw new BadRequestException('Status must be one of: pending, in_progress, done');
    }
    const existing = await this.prisma.laundry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Laundry not found');

    return this.prisma.laundry.update({
      where: { id },
      data: { status },
      include: { guest: true },
    });
  }

  remove(id: number) {
    return this.prisma.laundry.delete({ where: { id } });
  }
}
