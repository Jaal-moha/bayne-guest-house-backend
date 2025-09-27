import { Module } from '@nestjs/common';
import { LaundryService } from './laundry.service';
import { LaundryController } from './laundry.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LaundryController],
  providers: [LaundryService],
  exports: [LaundryService],
})
export class LaundryModule {}
