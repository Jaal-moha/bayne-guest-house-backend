import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { fakeUsers } from '../auth/fake-users';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UsersService } from '../users/users.service';
import { validationPipeOptions } from '../validation';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

process.env.JWT_SECRET = 'id-card-test-secret';

describe('Staff ID card routes', () => {
  let app: INestApplication;
  const users = fakeUsers();
  const receptionId = users.add({ role: 'reception' });
  const ownStaffId = 2;
  const staff = {
    findForIdCard: jest.fn((id: number) => {
      if (id > 30)
        return Promise.reject(new NotFoundException('Staff not found'));
      return Promise.resolve({
        id,
        name: `Hanna Girma ${id}`,
        role: 'barista',
        barcode: `EMP-00000${id}`,
        photo: null,
        user: id === ownStaffId ? { id: receptionId } : null,
      });
    }),
  };
  const jwt = new JwtService({ secret: 'id-card-test-secret' });
  const tokens = new Map<Role, string>();
  const tokenFor = (role: Role) => {
    if (!tokens.has(role)) {
      const id = role === 'reception' ? receptionId : users.add({ role });
      tokens.set(role, jwt.sign({ sub: id }));
    }
    return tokens.get(role)!;
  };
  const get = (as: Role | 'anon', path: string) => {
    const req = request(app.getHttpServer())
      .get(path)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    return as === 'anon'
      ? req
      : req.set('Authorization', `Bearer ${tokenFor(as)}`);
  };
  const expectPdf = (res: request.Response, filename: string) => {
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `inline; filename="${filename}"`,
    );
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [StaffController],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: UsersService, useValue: users.service },
        { provide: StaffService, useValue: staff },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('gives a manager one card as a PDF', async () => {
    const res = await get('manager', '/staff/3/id-card').expect(200);
    expectPdf(res, 'staff-EMP-000003.pdf');
  });

  it('gives a manager a sheet of the requested cards, read in the order given', async () => {
    const res = await get('manager', '/staff/id-cards?ids=3,1,4,2').expect(200);
    expectPdf(res, 'staff-cards-4.pdf');
    expect(staff.findForIdCard.mock.calls.map(([id]) => id)).toEqual([
      3, 1, 4, 2,
    ]);
  });

  it("lets reception print its own card but not another member's", async () => {
    await get('reception', `/staff/${ownStaffId}/id-card`).expect(200);
    await get('reception', '/staff/1/id-card').expect(403);
  });

  it('refuses reception the multi-card sheet before reading any staff', async () => {
    await get('reception', `/staff/id-cards?ids=${ownStaffId}`).expect(403);
    expect(staff.findForIdCard).not.toHaveBeenCalled();
  });

  it.each(['/staff/1/id-card', '/staff/id-cards?ids=1'])(
    'answers an anonymous %s with 401',
    async (path) => {
      await get('anon', path).expect(401);
    },
  );

  it.each([
    ['missing', ''],
    ['empty', '?ids='],
    ['zero', '?ids=0'],
    ['negative', '?ids=-1'],
    ['not a number', '?ids=1,a'],
    ['a trailing comma', '?ids=1,'],
    ['a repeat', '?ids=2,1,2'],
    ['given twice', '?ids=1&ids=2'],
    [
      'over 30 ids',
      `?ids=${Array.from({ length: 31 }, (_, i) => i + 1).join(',')}`,
    ],
  ])('rejects ids that are %s with 400', async (_, query) => {
    await get('manager', `/staff/id-cards${query}`).expect(400);
    expect(staff.findForIdCard).not.toHaveBeenCalled();
  });

  it('accepts 30 ids', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1).join(',');
    const res = await get('manager', `/staff/id-cards?ids=${ids}`).expect(200);
    expectPdf(res, 'staff-cards-30.pdf');
  });

  it('answers 404 when any id is unknown', async () => {
    await get('manager', '/staff/id-cards?ids=1,99').expect(404);
  });
});
