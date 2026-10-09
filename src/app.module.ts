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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaNotFoundFilter } from './prisma/prisma-not-found.filter';
import { DecimalToNumberInterceptor } from './prisma/decimal-to-number.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot(),
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
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: PrismaNotFoundFilter },
    { provide: APP_INTERCEPTOR, useClass: DecimalToNumberInterceptor },
  ],
})
export class AppModule {}
