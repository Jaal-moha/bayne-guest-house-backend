import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards, Res, NotFoundException, Req, ForbiddenException, Put, Delete } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';

@Controller('staff')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('admin', 'manager')
  findAll() {
    return this.staffService.findAll();
  }

  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Put(':id')
  @Roles('admin', 'manager')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Get(':id/id-card')
  async getIdCard(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Res() res: Response) {
    const user = req.user;
    const userId = (user && (user.id ?? user.userId ?? user.sub)) as number | undefined;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    if (user.role !== 'admin' && userId !== id) {
      throw new ForbiddenException('Access denied');
    }

    const staff = await this.staffService.findOne(id);
    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    // Generate QR code (use barcode or fallback to id)
    const qrText = staff.barcode ?? String(staff.id);
    const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 2, errorCorrectionLevel: 'H' });

    // Convert data URL to Buffer
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    // Create PDF with padding/margins
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 } // padding
    });

    // Prepare response headers so client can fetch and download without redirect
    const filename = `${(staff.name ?? 'staff').replace(/\s+/g, '_')}_id.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add a title
    doc.fontSize(18).text('Staff ID Card', { align: 'center' });
    doc.moveDown(1);

    // Draw staff details
    doc.fontSize(12).text(`Name: ${staff.name ?? 'N/A'}`, { align: 'center' });
    doc.text(`ID: ${staff.id}`, { align: 'center' });
    doc.moveDown(2);

    // Calculate image placement (centered) and size; leave padding around it
    const qrSize = 220; // px - adjust as needed
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const x = doc.page.margins.left + (pageWidth - qrSize) / 2;
    const y = doc.y; // current y position after texts

    doc.image(imgBuffer, x, y, { width: qrSize, height: qrSize });

    // Optionally add barcode text below the QR
    doc.moveDown( (qrSize / 72) + 1 ); // rough move to below image
    doc.fontSize(10).text(qrText, { align: 'center' });

    doc.end();
  }

  @Get(':id')
  @Roles('admin')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.staffService.findOne(id);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.staffService.delete(id);
  }
}
