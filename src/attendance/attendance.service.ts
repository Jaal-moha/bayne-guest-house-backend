import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAttendanceDto) {
    try {
      return await this.prisma.attendance.create({
        data: {
          staffId: dto.staffId,
          date: new Date(dto.date),
          checkIn: new Date(dto.checkIn),
          checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
        },
      });
    } catch (error) {
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

  update(id: number, data: any) {
    return this.prisma.attendance.update({ where: { id }, data });
  }

  remove(id: number) {
    return this.prisma.attendance.delete({ where: { id } });
  }
}
