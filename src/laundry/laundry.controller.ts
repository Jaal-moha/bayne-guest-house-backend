import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LaundryService } from './laundry.service';
import { CreateLaundryDto } from './dto/create-laundry.dto';
import { UpdateLaundryDto } from './dto/update-laundry.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('laundry')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LaundryController {
  constructor(private readonly laundry: LaundryService) {}

  @Get()
  @Roles('admin', 'housekeeping', 'reception', 'manager')
  findAll(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('guestId') guestId?: string,
  ) {
    return this.laundry.findAll({
      status,
      q,
      guestId: guestId ? Number(guestId) : undefined,
    });
  }

  @Get(':id')
  @Roles('admin', 'housekeeping', 'reception', 'manager')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.laundry.findOne(id);
  }

  @Post()
  @Roles('admin', 'housekeeping', 'reception', 'manager')
  create(@Body() body: any) {
    // Allow extra fields like price to pass through ValidationPipe
    // Optionally coerce numeric fields if present
    if (body && body.guestId) body.guestId = Number(body.guestId);
    if (body && body.price !== undefined) body.price = Number(body.price);
    return this.laundry.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'housekeeping', 'manager')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    // Allow optional price updates
    if (body && body.price !== undefined) body.price = Number(body.price);
    return this.laundry.update(id, body);
  }

  @Patch(':id/status')
  @Roles('admin', 'housekeeping', 'manager')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    // Service now validates: pending | in_progress | done
    return this.laundry.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.laundry.remove(id);
  }
}
