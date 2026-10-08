import {
  BadRequestException,
  Controller,
  NotFoundException,
  Post,
  Req,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '../auth/jwt.strategy';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import { getAddisDayContext } from './addis-day';

function apiKeyMatches(given: unknown, expected: string | undefined): boolean {
  if (typeof given !== 'string' || !given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type AttendanceAction = 'CHECK_IN' | 'CHECK_OUT' | 'ALREADY_CHECKED_OUT';

function rethrowPrisma(e: any): never {
  // Foreign key or validation errors -> 400
  if (e?.code === 'P2003' || e?.code === 'P2000' || e?.code === 'P2011') {
    throw new BadRequestException(e?.meta?.field_name || e?.message || 'Invalid data');
  }
  // Not found on update/delete -> 404
  if (e?.code === 'P2025') {
    throw new NotFoundException('Record not found');
  }
  throw e;
}

@Controller('attendance')
export class AttendanceScanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: JwtStrategy,
  ) {}

  private async hasValidToken(req: Request): Promise<boolean> {
    const token = req.headers.authorization?.replace(/^bearer\s+/i, '');
    if (!token) return false;
    try {
      await this.sessions.validate(await this.jwt.verifyAsync(token));
      return true;
    } catch {
      return false;
    }
  }

  @Post('scan')
  async scan(@Body() body: { code?: string; token?: string }, @Req() req: Request) {
    const apiKeyHeader =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.headers['x-api-token'] as string | undefined);
    const apiKeyValid = apiKeyMatches(apiKeyHeader, process.env.ATTENDANCE_API_KEY);
    if (!apiKeyValid && !(await this.hasValidToken(req))) {
      throw new UnauthorizedException('Missing or invalid credentials');
    }

    // Accept body.code or body.token from mobile scanners; normalize common QR prefixes
    const raw = (body?.code?.trim() || body?.token?.trim() || '');
    if (!raw) throw new BadRequestException('code is required');

    const code = raw
      .replace(/^ATT[:\-]/i, '')   // ATT:XYZ → XYZ
      .replace(/^STAFF[:\-]/i, '') // STAFF-XYZ → XYZ
      .trim();

    // Find staff by static barcode/QR code
    const staff = await this.prisma.staff.findUnique({
      where: { barcode: code },
      select: { id: true, name: true, role: true, barcode: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const { dayKey, dayStartUtc, dayEndUtc, nowUtc } = getAddisDayContext(new Date());

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.attendance.findFirst({
          where: {
            staffId: staff.id,
            date: { gte: dayStartUtc, lt: dayEndUtc },
          },
          orderBy: { date: 'desc' },
        });

        if (!existing) {
          // First scan -> check-in
          const created = await tx.attendance.create({
            data: {
              staffId: staff.id,
              date: dayStartUtc,
              checkIn: nowUtc,
            },
          });
          const attendance = await tx.attendance.findUnique({ where: { id: created.id } });
          return { action: 'CHECK_IN' as AttendanceAction, attendance };
        }

        if (existing.checkOut) {
          return { action: 'ALREADY_CHECKED_OUT' as AttendanceAction, attendance: existing };
        }

        const updated = await tx.attendance.update({
          where: { id: existing.id },
          data: { checkOut: nowUtc },
        });
        return { action: 'CHECK_OUT' as AttendanceAction, attendance: updated };
      });

      return {
        action: result.action,
        staff,
        attendance: result.attendance,
        day: dayKey,
      };
    } catch (e: any) {
      // Another writer created today's row first, so report that row instead of failing.
      if (e?.code === 'P2002') {
        const attendance = await this.prisma.attendance.findUnique({
          where: { staffId_date: { staffId: staff.id, date: dayStartUtc } },
        });
        if (attendance) {
          const action: AttendanceAction = attendance.checkOut ? 'ALREADY_CHECKED_OUT' : 'CHECK_IN';
          return { action, staff, attendance, day: dayKey };
        }
      }
      rethrowPrisma(e);
    }
  }
}
