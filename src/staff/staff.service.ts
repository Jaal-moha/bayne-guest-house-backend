import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

const USER_FIELDS = { select: { id: true, email: true, role: true, staffId: true, name: true } };

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  // The transaction rolls back on the User.email unique index, so a taken email leaves no row behind.
  private async conflictOnTakenEmail<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        [err.meta?.target].flat().some((t) => String(t).includes('email'))
      ) {
        throw new ConflictException('User with that username/email already exists');
      }
      throw err;
    }
  }

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
    const hashed = dto.username && dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const created = await this.conflictOnTakenEmail(() =>
      this.prisma.$transaction(async (tx) => {
        const staff = await tx.staff.create({
          data: {
            name: dto.name,
            role: dto.role,
            phone: dto.phone,
            emergencyContact: dto.emergencyContact ?? null,
            barcode,
          },
        });
        if (hashed) {
          await tx.user.create({
            data: {
              email: dto.username!,
              password: hashed,
              role: dto.role,
              staffId: staff.id,
              name: staff.name,
              forceChangePassword: dto.forceChangePassword ?? true,
            },
          });
        }
        return tx.staff.findUniqueOrThrow({ where: { id: staff.id }, include: { user: USER_FIELDS } });
      }),
    );

    return { ...created, idCardUrl: `/staff/${created.id}/id-card` };
  }

  async update(id: number, dto: UpdateStaffDto) {
    const existingStaff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existingStaff) throw new NotFoundException('Staff not found');

    const userData: any = {};
    if (dto.username) userData.email = dto.username;
    if (dto.password) userData.password = await bcrypt.hash(dto.password, 10);
    if (dto.forceChangePassword !== undefined) userData.forceChangePassword = dto.forceChangePassword;

    const updatedStaff = await this.conflictOnTakenEmail(() =>
      this.prisma.$transaction(async (tx) => {
        const staff = await tx.staff.update({
          where: { id },
          data: {
            name: dto.name ?? existingStaff.name,
            role: dto.role ?? existingStaff.role,
            phone: dto.phone ?? existingStaff.phone,
            emergencyContact: dto.emergencyContact ?? existingStaff.emergencyContact,
          },
        });
        if (existingStaff.user && (dto.username || dto.password)) {
          await tx.user.update({ where: { id: existingStaff.user.id }, data: userData });
        } else if (!existingStaff.user && dto.username && dto.password) {
          await tx.user.create({
            data: {
              ...userData,
              role: staff.role,
              staffId: staff.id,
              name: staff.name,
              forceChangePassword: dto.forceChangePassword ?? true,
            },
          });
        }
        return tx.staff.findUniqueOrThrow({ where: { id }, include: { user: USER_FIELDS } });
      }),
    );

    return { ...updatedStaff, idCardUrl: `/staff/${updatedStaff.id}/id-card` };
  }

  async delete(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    await this.prisma.$transaction(async (tx) => {
      if (staff.user) await tx.user.delete({ where: { id: staff.user.id } });
      await tx.staff.delete({ where: { id } });
    });

    return { message: 'Staff deleted successfully' };
  }

  findAll() {
    return this.prisma.staff.findMany({
      include: { user: USER_FIELDS },
      orderBy: { id: 'desc' },
    }).then((rows) => rows.map((r) => ({ ...r, idCardUrl: `/staff/${r.id}/id-card` })));
  }

  async findOne(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: USER_FIELDS },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return { ...staff, idCardUrl: `/staff/${staff.id}/id-card` };
  }
}
