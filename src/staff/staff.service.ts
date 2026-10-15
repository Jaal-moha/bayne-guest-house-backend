import {
  Injectable,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import type { StaffPhotoUpload } from './staff-photo';

const USER_FIELDS = {
  select: { id: true, email: true, role: true, staffId: true, name: true },
} as const;
const STAFF_INCLUDE = {
  user: USER_FIELDS,
  photo: { select: { updatedAt: true } },
} satisfies Prisma.StaffInclude;
type StaffRow = Prisma.StaffGetPayload<{ include: typeof STAFF_INCLUDE }>;

const toStaffJson = ({ photo, ...staff }: StaffRow) => ({
  ...staff,
  photoUpdatedAt: photo?.updatedAt ?? null,
  idCardUrl: `/staff/${staff.id}/id-card`,
});
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
        throw new ConflictException(
          'User with that username/email already exists',
        );
      }
      throw err;
    }
  }

  async create(dto: CreateStaffDto) {
    const hashed =
      dto.username && dto.password ? await bcrypt.hash(dto.password, 10) : null;

    // A failed insert aborts the Postgres transaction (25P02), so a barcode collision retries the whole transaction.
    for (let attempt = 0; attempt < BARCODE_ATTEMPTS; attempt++) {
      const barcode = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        return await this.createWithBarcode(dto, barcode, hashed);
      } catch (err) {
        if (!isUniqueViolationOn(err, 'barcode')) throw err;
      }
    }
    throw new ServiceUnavailableException(
      'Could not allocate a unique staff barcode, try again',
    );
  }

  private async createWithBarcode(
    dto: CreateStaffDto,
    barcode: string,
    hashed: string | null,
  ) {
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
        return tx.staff.findUniqueOrThrow({
          where: { id: staff.id },
          include: STAFF_INCLUDE,
        });
      }),
    );

    return toStaffJson(created);
  }

  async update(id: number, dto: UpdateStaffDto) {
    const existingStaff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existingStaff) throw new NotFoundException('Staff not found');

    const userData: {
      email?: string;
      password?: string;
      forceChangePassword?: boolean;
    } = {};
    if (dto.username) userData.email = dto.username;
    if (dto.password) userData.password = await bcrypt.hash(dto.password, 10);
    if (dto.forceChangePassword !== undefined)
      userData.forceChangePassword = dto.forceChangePassword;

    const updatedStaff = await this.conflictOnTakenEmail(() =>
      this.prisma.$transaction(async (tx) => {
        const staff = await tx.staff.update({
          where: { id },
          data: {
            name: dto.name ?? existingStaff.name,
            role: dto.role ?? existingStaff.role,
            phone: dto.phone ?? existingStaff.phone,
            emergencyContact:
              dto.emergencyContact ?? existingStaff.emergencyContact,
          },
        });
        if (existingStaff.user && (dto.username || dto.password)) {
          await tx.user.update({
            where: { id: existingStaff.user.id },
            data: userData,
          });
        } else if (!existingStaff.user && userData.email && userData.password) {
          await tx.user.create({
            data: {
              ...userData,
              email: userData.email,
              password: userData.password,
              role: staff.role,
              staffId: staff.id,
              name: staff.name,
              forceChangePassword: dto.forceChangePassword ?? true,
            },
          });
        }
        return tx.staff.findUniqueOrThrow({
          where: { id },
          include: STAFF_INCLUDE,
        });
      }),
    );

    return toStaffJson(updatedStaff);
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
    return this.prisma.staff
      .findMany({ include: STAFF_INCLUDE, orderBy: { id: 'desc' } })
      .then((rows) => rows.map(toStaffJson));
  }

  async findOne(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return toStaffJson(staff);
  }

  async findForIdCard(id: number) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: {
        user: { select: { id: true } },
        photo: { select: { data: true } },
      },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  async setPhoto(staffId: number, photo: StaffPhotoUpload) {
    try {
      const saved = await this.prisma.staffPhoto.upsert({
        where: { staffId },
        create: { staffId, ...photo },
        update: photo,
        select: { updatedAt: true },
      });
      return { photoUpdatedAt: saved.updatedAt };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new NotFoundException('Staff not found');
      }
      throw err;
    }
  }

  async getPhoto(staffId: number) {
    const photo = await this.prisma.staffPhoto.findUnique({
      where: { staffId },
      select: { mime: true, data: true },
    });
    if (!photo) throw new NotFoundException('Staff member has no photo');
    return photo;
  }

  async deletePhoto(staffId: number) {
    await this.prisma.staffPhoto.deleteMany({ where: { staffId } });
  }
}
