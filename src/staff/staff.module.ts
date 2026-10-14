import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { IdCardDemoController } from './id-card-demo.controller';

@Module({
  // The demo controller goes first so GET /staff/:id does not claim /staff/id-card-demo.
  controllers: [IdCardDemoController, StaffController],
  providers: [StaffService],
})
export class StaffModule {}
