import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { GuestsModule } from './guests/guests.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LaundryModule } from './laundry/laundry.module';
import { InventoryModule } from './inventory/inventory.module';
import { StaffModule } from './staff/staff.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    GuestsModule,
    RoomsModule,
    BookingsModule,
    PaymentsModule,
    AttendanceModule,
    LaundryModule,
    InventoryModule,
    StaffModule,
    StatsModule,
  ],
})
export class AppModule {}
