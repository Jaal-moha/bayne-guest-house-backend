import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Req,
  Body,
  UnauthorizedException,
  Get,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

const ALLOWED_ROLES = ['admin','manager','reception','security','housekeeping','barista','store','finance'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

function decodeJwtPayloadFromAuthHeader(authHeader?: string): any | null {
  if (!authHeader) return null;
  try {
    const parts = authHeader.split(' ');
    const raw = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : authHeader;
    const [, payload] = raw.split('.');
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : '';
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hasAllowedRole(payload: any): boolean {
  const roles = Array.isArray(payload?.roles) ? payload.roles : payload?.role ? [payload.role] : [];
  return roles.some((r: string) => ALLOWED_ROLES.includes(r as AllowedRole));
}

// Addis Ababa (UTC+3) local day → return day key and UTC bounds for that local day
function getAddisDayContext(nowUtc = new Date()) {
  const offsetMin = 180; // UTC+3
  const offsetMs = offsetMin * 60 * 1000;
  const addisMs = nowUtc.getTime() + offsetMs;
  const addisNow = new Date(addisMs);
  const y = addisNow.getUTCFullYear();
  const m = addisNow.getUTCMonth();
  const d = addisNow.getUTCDate();
  const dayKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayStartUtc = new Date(Date.UTC(y, m, d) - offsetMs);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dayKey, dayStartUtc, dayEndUtc, nowUtc };
}

type AttendanceAction = 'CHECK_IN' | 'CHECK_OUT' | 'ALREADY_CHECKED_OUT';

// Optional: map common Prisma errors to readable responses
function rethrowPrisma(e: any): never {
  // Unique violation -> 409 (client may retry)
  if (e?.code === 'P2002') {
    throw new ConflictException('Duplicate attendance for day, please retry');
  }
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
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  create(@Body() createAttendanceDto: CreateAttendanceDto) {
    return this.attendanceService.create(createAttendanceDto);
  }

  @Get()
  findAll() {
    return this.attendanceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateAttendanceDto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, updateAttendanceDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.remove(id);
  }

  @Post('scan')
  async scan(@Body() body: { code?: string; token?: string }, @Req() req: Request) {
    // Support either Bearer JWT with allowed role OR API key header for mobile scanners
    const authHeader = req.headers['authorization'] as string | undefined;
    const payload = decodeJwtPayloadFromAuthHeader(authHeader);
    const apiKeyHeader =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.headers['x-api-token'] as string | undefined);
    const apiKeyValid =
      !!apiKeyHeader && !!process.env.ATTENDANCE_API_KEY && apiKeyHeader === process.env.ATTENDANCE_API_KEY;

    if (!payload && !apiKeyValid) {
      throw new UnauthorizedException('Missing or invalid credentials');
    }
    if (payload && !hasAllowedRole(payload)) {
      throw new ForbiddenException('Insufficient role');
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
        // Enforce one row per Addis day using the 'date' column within local-day bounds
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
              // method/locationId/etc if applicable
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
      rethrowPrisma(e);
    }
  }
}
