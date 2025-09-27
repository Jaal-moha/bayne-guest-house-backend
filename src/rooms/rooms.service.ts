import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateRoomDto) {
    return this.prisma.room.create({ data: dto as any });
  }

  findAll() {
    return this.prisma.room.findMany({ orderBy: { number: 'asc' } });
  }

  findOne(id: number) {
    return this.prisma.room.findUnique({ where: { id } });
  }

  update(id: number, dto: UpdateRoomDto) {
    return this.prisma.room.update({ where: { id }, data: dto as any });
  }

  remove(id: number) {
    return this.prisma.room.delete({ where: { id } });
  }

  /**
   * Return rooms that DO NOT have any booking overlapping the given range.
   */
  async findAvailable(checkInISO: string, checkOutISO: string) {
    const checkIn = new Date(checkInISO);
    const checkOut = new Date(checkOutISO);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      throw new BadRequestException('Invalid dates');
    }
    if (checkIn >= checkOut) {
      throw new BadRequestException('checkIn must be before checkOut');
    }

    return this.prisma.room.findMany({
      where: {
        bookings: {
          none: {
            AND: [
              { checkIn: { lt: checkOut } }, // existing starts before new ends
              { checkOut: { gt: checkIn } }, // existing ends after new starts
            ],
          },
        },
      },
      orderBy: { number: 'asc' },
    });
  }
}
