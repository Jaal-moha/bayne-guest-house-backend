import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';

@Injectable()
export class GuestsService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateGuestDto) {
    return this.prisma.guest.create({ data });
  }

  findAll() {
    return this.prisma.guest.findMany();
  }

  findOne(id: number) {
    return this.prisma.guest.findUnique({ where: { id } });
  }

  update(id: number, data: UpdateGuestDto) {
    return this.prisma.guest.update({ where: { id }, data });
  }

  remove(id: number) {
    return this.prisma.guest.delete({ where: { id } });
  }
}
