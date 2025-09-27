import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import { unlink } from 'fs/promises';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
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

    try {
      await this.generateIdCardPdf({ id: created.id, name: created.name, role: created.role, barcode: created.barcode });
    } catch (err) {
      console.error('Failed to generate ID card PDF', err);
    }

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
