import { validationPipeOptions } from './validation';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './auth/jwt.strategy';
import { fakeUsers } from './auth/fake-users';
import { UsersService } from './users/users.service';
import { LaundryController } from './laundry/laundry.controller';
import { LaundryService } from './laundry/laundry.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

process.env.JWT_SECRET = 'money-test-secret';

// Every money column is DECIMAL(12,2): at most 2 decimal places, below 1e10.
describe('Money fields over HTTP', () => {
  let app: INestApplication;
  const payments = { create: jest.fn(), update: jest.fn() };
  const laundry = { create: jest.fn(), update: jest.fn() };
  const rooms = { create: jest.fn(), update: jest.fn() };
  const users = fakeUsers();
  const admin = users.add({ role: 'admin' });
  const jwt = new JwtService({ secret: 'money-test-secret' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [PaymentsController, LaundryController, RoomsController],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: UsersService, useValue: users.service },
        { provide: PaymentsService, useValue: payments },
        { provide: LaundryService, useValue: laundry },
        { provide: RoomsService, useValue: rooms },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  const routes = [
    { verb: 'post', path: '/payments', field: 'amount', base: { serviceType: 'DINING', guestId: 2, method: 'cash' }, ok: 12.5, mock: payments.create, code: 201 },
    { verb: 'patch', path: '/payments/1', field: 'amount', base: {}, ok: 12.5, mock: payments.update, code: 200 },
    { verb: 'post', path: '/laundry', field: 'price', base: { guestId: 2, items: 'towels' }, ok: 12.5, mock: laundry.create, code: 201 },
    { verb: 'patch', path: '/laundry/1', field: 'price', base: {}, ok: 12.5, mock: laundry.update, code: 200 },
    { verb: 'post', path: '/rooms', field: 'price', base: { number: '101', type: 'double' }, ok: 512.5, mock: rooms.create, code: 201 },
    { verb: 'patch', path: '/rooms/1', field: 'price', base: {}, ok: 512.5, mock: rooms.update, code: 200 },
  ] as const;

  const send = (r: (typeof routes)[number], value: unknown) =>
    request(app.getHttpServer())
      [r.verb](r.path)
      .set('Authorization', `Bearer ${jwt.sign({ sub: admin })}`)
      .send({ ...r.base, [r.field]: value });

  describe.each(routes)('$verb $path', (r) => {
    it.each([0.001, '0.001', 1.005, 1e-7, r.ok + 0.001, 1e10, 99999999999])('rejects %p with 400', async (value) => {
      const res = await send(r, value);
      expect(res.status).toBe(400);
      expect(r.mock).not.toHaveBeenCalled();
    });

    it.each([r.ok, 9999999999.99])('accepts %p unchanged', async (value) => {
      await send(r, value).expect(r.code);
      expect(r.mock.mock.calls[0].at(-1)[r.field]).toBe(value);
    });
  });
});
