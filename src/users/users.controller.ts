import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserForStaffDto } from './dto/create-user-for-staff.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // POST /users/staff/123
  @Post('staff/:staffId')
  @Roles('admin', 'manager') // only admins and managers can create accounts
  createForStaff(
    @Param('staffId', ParseIntPipe) staffId: number,
    @Body() dto: CreateUserForStaffDto,
  ) {
    return this.users.createForStaff(staffId, dto);
  }
}
