import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IdCard, renderIdCards, ROLE_LABELS } from './id-card';
import { parseStaffPhoto } from './staff-photo';

type JwtUser = { role?: string; id?: number; userId?: number; sub?: number };

const ID_CARD_ROLES = ['admin', 'manager'];
// Multer answers anything past this with 413 before parseStaffPhoto sees it; between 2 MB and this cap parseStaffPhoto answers 400.
const UPLOAD_CAP_BYTES = 10 * 1024 * 1024;

type IdCardStaff = Awaited<ReturnType<StaffService['findForIdCard']>>;

const toIdCard = (staff: IdCardStaff, issued: Date): IdCard => ({
  name: staff.name,
  role: ROLE_LABELS[staff.role],
  code: staff.barcode,
  issued,
  photo: staff.photo ? Buffer.from(staff.photo.data) : undefined,
});

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

  @Put(':id/photo')
  @Roles('admin', 'manager')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: UPLOAD_CAP_BYTES, files: 1 },
    }),
  )
  setPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    return this.staffService.setPhoto(id, parseStaffPhoto(file?.buffer));
  }

  @Get(':id/photo')
  @Roles('admin', 'manager')
  @Header('Cache-Control', 'private, max-age=0')
  async getPhoto(@Param('id', ParseIntPipe) id: number) {
    const photo = await this.staffService.getPhoto(id);
    return new StreamableFile(photo.data, { type: photo.mime });
  }

  @Delete(':id/photo')
  @Roles('admin', 'manager')
  @HttpCode(204)
  async deletePhoto(@Param('id', ParseIntPipe) id: number) {
    await this.staffService.deletePhoto(id);
  }

  @Get(':id/id-card')
  async getIdCard(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: JwtUser },
  ) {
    const user = req.user;
    const userId = user?.id ?? user?.userId ?? user?.sub;
    const staff = await this.staffService.findForIdCard(id);
    if (
      !ID_CARD_ROLES.includes(user?.role ?? '') &&
      staff.user?.id !== userId
    ) {
      throw new ForbiddenException('Access denied');
    }

    const sheet = renderIdCards([toIdCard(staff, new Date())]);
    return new StreamableFile(sheet, {
      type: 'application/pdf',
      disposition: `inline; filename="staff-${staff.barcode}.pdf"`,
    });
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
