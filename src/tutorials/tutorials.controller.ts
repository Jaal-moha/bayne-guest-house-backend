import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import type { SessionUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { MEDIA_URL_TTL_SEC } from './signed-url';
import { TutorialsService } from './tutorials.service';

@Controller('tutorials')
export class TutorialsController {
  constructor(private readonly tutorials: TutorialsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  list(@Req() req: Request & { user: SessionUser }) {
    return this.tutorials.listFor(req.user.role);
  }

  @Get('media/:file')
  async media(
    @Param('file') file: string,
    @Query('exp') exp: unknown,
    @Query('sig') sig: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const dir = await this.tutorials.mediaDir(file);
    if (!dir) throw new NotFoundException();
    if (!this.tutorials.isSigned(file, exp, sig))
      throw new ForbiddenException('Invalid or expired media link');

    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        file,
        {
          root: dir,
          dotfiles: 'deny',
          cacheControl: false,
          headers: {
            'Cache-Control': `private, max-age=${MEDIA_URL_TTL_SEC}`,
            'X-Content-Type-Options': 'nosniff',
            ...(file.endsWith('.mp4') ? { 'Content-Type': 'video/mp4' } : {}),
          },
        },
        (err?: Error & { status?: number; code?: string }) => {
          if (!err || res.headersSent) return resolve();
          if (err.code === 'ENOENT') return reject(new NotFoundException());
          reject(new HttpException(err.message, err.status ?? 500));
        },
      );
    });
  }
}
