import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { GuestsService } from './guests.service';
import { CreateGuestDto } from './dto/create-guest.dto';
import { UpdateGuestDto } from './dto/update-guest.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('guests')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  @Roles('admin','reception', 'manager')
  findAll() {
    return this.guestsService.findAll();
  }

  @Post()
  @Roles('admin','reception', 'manager')
  create(@Body() dto: CreateGuestDto) {
    return this.guestsService.create(dto);
  }

  @Get(':id')
  @Roles('admin','reception', 'manager')
  findOne(@Param('id') id: string) {
    return this.guestsService.findOne(+id);
  }

  @Patch(':id')
  @Roles('admin','reception', 'manager')
  update(@Param('id') id: string, @Body() dto: UpdateGuestDto) {
    return this.guestsService.update(+id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.guestsService.remove(+id);
  }
}
