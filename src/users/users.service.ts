import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { CreateUserForStaffDto } from './dto/create-user-for-staff.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // False when the stored hash is no longer currentHash, e.g. an admin reset it after the caller read it.
  async setPassword(id: number, currentHash: string, newHash: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, password: currentHash },
      data: { password: newHash, forceChangePassword: false },
    });
    return count === 1;
  }

  async createForStaff(staffId: number, dto: CreateUserForStaffDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    if (staff.user) throw new BadRequestException('This staff already has a user account');

    const existing = await this.findByEmail(dto.email);
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Default role to the staff's role if not provided
    const role = dto.role ?? staff.role;

    return this.prisma.user.create({
      data: {
        name: staff.name,
        email: dto.email,
        password: passwordHash,
        role,
        staff: { connect: { id: staffId } },
      },
      select: {
        id: true, email: true, role: true, staffId: true, name: true, createdAt: true,
      },
    });
  }
}
