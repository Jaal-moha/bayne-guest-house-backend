import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import { unlink } from 'fs/promises';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
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

  private async generateIdCardPdf(staff: { id: number; name: string; role: string; barcode: string }) {
    const outDir = path.join(process.cwd(), 'public', 'staff-ids');
    await fs.promises.mkdir(outDir, { recursive: true });
    const filePath = path.join(outDir, `${staff.barcode}.pdf`);

    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: staff.barcode,
      scale: 3,
      height: 50,
      includetext: false,
    });

    const doc = new PDFDocument({ size: [300, 420], margins: { top: 16, left: 16, right: 16, bottom: 16 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.rect(0, 0, 300, 420).fill('#ffffff');
    doc.fillColor('#111827').fontSize(14).text('GuestHouse', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(staff.name, { align: 'center', bold: true });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#4b5563').text(staff.role, { align: 'center' });

    const imgWidth = 220;
    const x = (300 - imgWidth) / 2;
    doc.image(png, x, 180, { width: imgWidth });
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#374151').text(staff.barcode, { align: 'center' });

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    return filePath;
  }

  async create(dto: CreateStaffDto) {
    const barcode = await this.generateUniqueBarcode();
    const hashed = dto.username && dto.password ? await bcrypt.hash(dto.password, 10) : null;

    const created = await this.conflictOnTakenEmail(() =>
      this.prisma.$transaction(async (tx) => {
        const staff = await tx.staff.create({
          data: {
            name: dto.name,
            role: dto.role as any,
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
              role: dto.role as Role ?? 'reception' as Role,
              staffId: staff.id,
              name: staff.name,
              forceChangePassword: dto.forceChangePassword ?? true,
            },
          });
        }
        return tx.staff.findUniqueOrThrow({ where: { id: staff.id }, include: { user: USER_FIELDS } });
      }),
    );

    try {
      await this.generateIdCardPdf({ id: created.id, name: created.name, role: created.role, barcode: created.barcode });
    } catch (err) {
      console.error('Failed to generate ID card PDF', err);
    }

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
            role: dto.role as any ?? existingStaff.role,
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
              role: staff.role as Role ?? 'reception' as Role,
              staffId: staff.id,
              name: staff.name,
              forceChangePassword: dto.forceChangePassword ?? true,
            },
          });
        }
        return tx.staff.findUniqueOrThrow({ where: { id }, include: { user: USER_FIELDS } });
      }),
    );

    // Regenerate ID card PDF
    try {
      await this.generateIdCardPdf({
        id: updatedStaff.id,
        name: updatedStaff.name,
        role: updatedStaff.role,
        barcode: updatedStaff.barcode,
      });
    } catch (err) {
      console.error('Failed to regenerate ID card PDF', err);
    }

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

    // Remove ID card PDF if exists
    try {
      const filePath = path.join(process.cwd(), 'public', 'staff-ids', `${staff.barcode}.pdf`);
      await unlink(filePath);
    } catch (err) {
      // Ignore if file doesn't exist
    }

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
