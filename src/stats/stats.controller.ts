import { Controller, Get, Query, BadRequestException, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, } from '../auth/roles.decorator';

@Controller('stats')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  // GET /stats/overview?start=2025-01-01&end=2025-01-07
  @Get('overview')
  @Roles('admin', 'manager', 'reception', 'finance')
  async overview(@Query('start') start?: string, @Query('end') end?: string) {
    let range: { start?: Date; end?: Date } | undefined;

    if (start || end) {
      let s: Date | undefined;
      let e: Date | undefined;

      if (start) {
        s = new Date(start);
        if (isNaN(s.getTime())) throw new BadRequestException('Invalid "start" date');
      }
      if (end) {
        e = new Date(end);
        if (isNaN(e.getTime())) throw new BadRequestException('Invalid "end" date');
      }

      range = { start: s, end: e };
    }

    return this.stats.overview(range);
  }

  // GET /stats/series?days=14
  @Get('series')
  @Roles('admin', 'manager', 'reception', 'finance', 'store')
  async series(@Query('days', ParseIntPipe) days = 7) {
    return this.stats.series(days);
  }
}
