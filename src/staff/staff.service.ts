import { Injectable, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';

const USER_FIELDS = { select: { id: true, email: true, role: true, staffId: true, name: true } };
const BARCODE_ATTEMPTS = 5;

const isUniqueViolationOn = (err: unknown, field: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError &&
  err.code === 'P2002' &&
  [err.meta?.target].flat().some((t) => String(t).includes(field));

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  // The transaction rolls back on the User.email unique index, so a taken email leaves no row behind.
  private async conflictOnTakenEmail<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (isUniqueViolationOn(err, 'email')) {
        throw new ConflictException('User with that username/email already exists');
      }
      throw err;
    }
  }

  async create(dto: CreateStaffDto) {
    const hashed = dto.username && dto.password ? await bcrypt.hash(dto.password, 10) : null;

    // A failed insert aborts the Postgres transaction (25P02), so a barcode collision retries the whole transaction.
    for (let attempt = 0; attempt < BARCODE_ATTEMPTS; attempt++) {
      const barcode = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        return await this.createWithBarcode(dto, barcode, hashed);
      } catch (err) {
        if (!isUniqueViolationOn(err, 'barcode')) throw err;
      }
    }
    throw new ServiceUnavailableException('Could not allocate a unique staff barcode, try again');
  }

  private async createWithBarcode(dto: CreateStaffDto, barcode: string, hashed: string | null) {
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
