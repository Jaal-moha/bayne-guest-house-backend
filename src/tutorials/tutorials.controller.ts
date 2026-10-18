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
import { extname } from 'node:path';
import { openMediaFile } from './media-file';
import type { SessionUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { MEDIA_URL_TTL_SEC } from './signed-url';
import { TutorialsService } from './tutorials.service';

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

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

    const handle = await openMediaFile(dir, file);
    if (!handle) throw new NotFoundException();
    const contentType = MEDIA_CONTENT_TYPES[extname(file)];
    try {
      await new Promise<void>((resolve, reject) => {
        res.sendFile(
          String(handle.fd),
          {
            root: '/proc/self/fd',
            dotfiles: 'deny',
            cacheControl: false,
            headers: {
              'Cache-Control': `private, max-age=${MEDIA_URL_TTL_SEC}`,
              'X-Content-Type-Options': 'nosniff',
              'Content-Type': contentType,
            },
          },
          (err?: Error & { status?: number; code?: string }) => {
            if (!err || res.headersSent) return resolve();
            if (err.code === 'ENOENT') return reject(new NotFoundException());
            reject(new HttpException(err.message, err.status ?? 500));
          },
        );
      });
    } finally {
      await handle.close();
    }
  }
}
