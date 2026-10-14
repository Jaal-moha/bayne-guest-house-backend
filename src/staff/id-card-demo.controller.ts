// Temporary client demo of ID card options. Delete with the demo page once the client picks.
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { StaffService } from './staff.service';
import {
  DEFAULT_ID_CARD_OPTIONS,
  IdCardOptions,
  renderIdCards,
  ROLE_LABELS,
} from './id-card';

const MAX_IDS = 12;
const MAX_WORDMARK = 24;
const PHOTOS = [
  'passport',
  'compact',
] as const satisfies readonly IdCardOptions['photo'][];
const BACKS = [
  'white',
  'tint',
] as const satisfies readonly IdCardOptions['back'][];
const PER_PAGE = [1, 3] as const satisfies readonly IdCardOptions['perPage'][];

type DemoQuery = Record<string, unknown>;

function text(query: DemoQuery, name: string): string | undefined {
  const raw = query[name];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string')
    throw new BadRequestException(`${name} must be given once`);
  return raw;
}

function choice<T extends string | number>(
  query: DemoQuery,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = text(query, name);
  if (raw === undefined) return fallback;
  const hit = allowed.find((v) => String(v) === raw);
  if (hit === undefined)
    throw new BadRequestException(
      `${name} must be one of ${allowed.join(', ')}`,
    );
  return hit;
}

export function parseDemoQuery(query: DemoQuery): {
  ids: number[];
  options: IdCardOptions;
} {
  const ids = (text(query, 'ids') ?? '').split(',').map((part) => {
    if (!/^[1-9]\d{0,8}$/.test(part))
      throw new BadRequestException('ids must be staff ids such as 1,2,3');
    return Number(part);
  });
  if (ids.length > MAX_IDS)
    throw new BadRequestException(`ids takes at most ${MAX_IDS} staff`);

  const wordmark =
    text(query, 'wordmark')?.trim() || DEFAULT_ID_CARD_OPTIONS.wordmark;
  if (wordmark.length > MAX_WORDMARK)
    throw new BadRequestException(
      `wordmark takes at most ${MAX_WORDMARK} characters`,
    );

  return {
    ids,
    options: {
      photo: choice(query, 'photo', PHOTOS, DEFAULT_ID_CARD_OPTIONS.photo),
      back: choice(query, 'back', BACKS, DEFAULT_ID_CARD_OPTIONS.back),
      wordmark,
      perPage: choice(
        query,
        'perPage',
        PER_PAGE,
        DEFAULT_ID_CARD_OPTIONS.perPage,
      ),
    },
  };
}

@Controller('staff/id-card-demo')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class IdCardDemoController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('admin', 'manager')
  async render(@Query() query: DemoQuery) {
    const { ids, options } = parseDemoQuery(query);
    const staff = await Promise.all(
      ids.map((id) => this.staffService.findForIdCard(id)),
    );
    const issued = new Date();
    const sheet = renderIdCards(
      staff.map((s) => ({
        name: s.name,
        role: ROLE_LABELS[s.role],
        code: s.barcode,
        issued,
        phone: s.phone,
        photo: s.photo ? Buffer.from(s.photo.data) : undefined,
      })),
      options,
    );
    return new StreamableFile(sheet, {
      type: 'application/pdf',
      disposition: 'inline; filename="id-card-demo.pdf"',
    });
  }
}
