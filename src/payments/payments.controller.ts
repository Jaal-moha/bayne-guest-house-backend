import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles('admin','finance','manager','reception')
  findAll() { return this.payments.findAll(); }

  @Get(':id')
  @Roles('admin','finance','manager','reception')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.payments.findOne(id); }

  @Post()
  @Roles('admin','finance','manager','reception')
  create(@Body() body: any) {
    // Allow fields not present in DTO: serviceType, laundryId, guestId
    if (body.bookingId != null) body.bookingId = Number(body.bookingId);
    if (body.laundryId != null) body.laundryId = Number(body.laundryId);
    if (body.guestId != null) body.guestId = Number(body.guestId);
    if (body.amount !== undefined && body.amount !== '') body.amount = Number(body.amount);
    return this.payments.create(body);
  }

  @Patch(':id')
  @Roles('admin','finance','reception','manager')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    if (body.amount !== undefined && body.amount !== '') body.amount = Number(body.amount);
    return this.payments.update(id, body);
  }

  @Delete(':id')
  @Roles('admin','finance','reception','manager')
  remove(@Param('id', ParseIntPipe) id: number) { return this.payments.remove(id); }
}
