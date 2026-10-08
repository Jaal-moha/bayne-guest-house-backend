import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  private async generateUniqueBarcode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
      const exists = await this.prisma.staff.findUnique({ where: { barcode: code } });
      if (!exists) return code;
    }
    return `EMP-${Date.now().toString().slice(-6)}`;
  }

  async create(dto: CreateStaffDto) {
    const barcode = await this.generateUniqueBarcode();

    const created = await this.prisma.staff.create({
      data: {
        name: dto.name,
        role: dto.role as any,
        phone: dto.phone,
        emergencyContact: dto.emergencyContact ?? null,
        barcode,
      },
    });

    // If the creator provided username/password, create a linked user account
    if (dto.username && dto.password) {
      // ensure username/email is not already taken
      const existing = await this.prisma.user.findUnique({ where: { email: dto.username } });
      if (existing) {
        // rollback staff or throw conflict — choose to throw so frontend shows error
        throw new ConflictException('User with that username/email already exists');
      }

      const hashed = await bcrypt.hash(dto.password, 10);
      try {
        await this.prisma.user.create({
          data: {
            email: dto.username,
            password: hashed,
            role: dto.role as Role ?? 'reception' as Role,
            staffId: created.id,
            name: created.name,
            forceChangePassword: dto.forceChangePassword ?? true,
          },
        });
      } catch (err) {
        console.error('Failed to create user for staff', err);
        // optionally clean up staff here if desired
      }
    }

    // fetch staff including user to return
    const withUser = await this.prisma.staff.findUnique({
      where: { id: created.id },
      include: { user: { select: { id: true, email: true, role: true, staffId: true, name: true } } },
    });

    return { ...(withUser ?? created), idCardUrl: `/staff/${created.id}/id-card` };
  }

  async update(id: number, dto: UpdateStaffDto) {
    const existingStaff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existingStaff) throw new NotFoundException('Staff not found');

    // Update staff data
    const updatedStaff = await this.prisma.staff.update({
      where: { id },
      data: {
        name: dto.name ?? existingStaff.name,
        role: dto.role as any ?? existingStaff.role,
        phone: dto.phone ?? existingStaff.phone,
        emergencyContact: dto.emergencyContact ?? existingStaff.emergencyContact,
      },
    });

    // Handle user updates if provided
    if (dto.username || dto.password) {
      const userData: any = {};
      if (dto.username) {
        const existingUser = await this.prisma.user.findUnique({ where: { email: dto.username } });
        if (existingUser && existingUser.id !== existingStaff.user?.id) {
          throw new ConflictException('User with that username/email already exists');
        }
        userData.email = dto.username;
      }
      if (dto.password) {
        userData.password = await bcrypt.hash(dto.password, 10);
      }
      if (dto.forceChangePassword !== undefined) {
        userData.forceChangePassword = dto.forceChangePassword;
      }

      if (existingStaff.user) {
        await this.prisma.user.update({
          where: { id: existingStaff.user.id },
          data: userData,
        });
      } else if (dto.username && dto.password) {
        await this.prisma.user.create({
          data: {
            ...userData,
            role: updatedStaff.role as Role ?? 'reception' as Role,
            staffId: updatedStaff.id,
            name: updatedStaff.name,
            forceChangePassword: dto.forceChangePassword ?? true,
          },
        });
      }
    }

    // Return updated staff with user and ID card URL
    const withUser = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, role: true, staffId: true, name: true } } },
    });
    return { ...(withUser ?? updatedStaff), idCardUrl: `/staff/${updatedStaff.id}/id-card` };
  }

  async delete(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    // Delete associated user if exists
    if (staff.user) {
      await this.prisma.user.delete({ where: { id: staff.user.id } });
    }

    // Delete staff
    await this.prisma.staff.delete({ where: { id } });

    return { message: 'Staff deleted successfully' };
  }

  findAll() {
    return this.prisma.staff.findMany({
      include: { user: { select: { id: true, email: true, role: true, staffId: true, name: true } } },
      orderBy: { id: 'desc' },
    }).then((rows) => rows.map((r) => ({ ...r, idCardUrl: `/staff/${r.id}/id-card` })));
  }

  async findOne(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, role: true, staffId: true, name: true } } },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return { ...staff, idCardUrl: `/staff/${staff.id}/id-card` };
  }
}
