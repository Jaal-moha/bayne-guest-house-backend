import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { getAddisDayContext } from './addis-day';

const dayKey = (date: string) => getAddisDayContext(new Date(date)).dayStartUtc;

function rethrowDuplicateDay(error: any): void {
  if (error?.code === 'P2002') throw new ConflictException('Attendance already exists for this staff member and day');
}

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAttendanceDto) {
    try {
      return await this.prisma.attendance.create({
        data: {
          staffId: dto.staffId,
          date: dayKey(dto.date),
          checkIn: new Date(dto.checkIn),
          checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
        },
      });
    } catch (error) {
      rethrowDuplicateDay(error);
      console.error(error);
      throw new BadRequestException('Invalid data: ' + error.message);
    }
  }

  findAll() {
    return this.prisma.attendance.findMany({ include: { staff: true } });
  }

  findOne(id: number) {
    return this.prisma.attendance.findUnique({ where: { id }, include: { staff: true } });
  }

  async update(id: number, dto: UpdateAttendanceDto) {
    try {
      return await this.prisma.attendance.update({
        where: { id },
        data: { ...dto, ...(dto.date !== undefined ? { date: dayKey(dto.date) } : {}) },
      });
    } catch (error) {
      rethrowDuplicateDay(error);
      throw error;
    }
  }

  remove(id: number) {
    return this.prisma.attendance.delete({ where: { id } });
  }
}
