import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScanController } from './attendance-scan.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController, AttendanceScanController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
