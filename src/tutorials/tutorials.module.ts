import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TutorialsController } from './tutorials.controller';
import {
  TUTORIALS_CONFIG,
  TutorialsService,
  tutorialsConfig,
} from './tutorials.service';

@Module({
  imports: [ConfigModule],
  controllers: [TutorialsController],
  providers: [
    {
      provide: TUTORIALS_CONFIG,
      inject: [ConfigService],
      useFactory: tutorialsConfig,
    },
    TutorialsService,
  ],
})
export class TutorialsModule {}
