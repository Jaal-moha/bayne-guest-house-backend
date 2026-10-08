import { validationPipeOptions } from '../validation';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { LaundryController } from '../laundry/laundry.controller';
import { LaundryService } from '../laundry/laundry.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

process.env.JWT_SECRET = 'dto-test-secret';

describe('Payments and laundry HTTP bodies', () => {
  let app: INestApplication;
  const payments = { create: jest.fn(), update: jest.fn() };
  const laundry = { create: jest.fn(), update: jest.fn() };
  const jwt = new JwtService({ secret: 'dto-test-secret' });
  const send = (
    route: string,
    verb: 'post' | 'patch',
    body: object,
    role = 'manager',
  ) =>
    request(app.getHttpServer())
      [verb](route)
      .set('Authorization', `Bearer ${jwt.sign({ sub: 1, role })}`)
      .send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [PaymentsController, LaundryController],
      providers: [
        JwtStrategy,
        { provide: PaymentsService, useValue: payments },
        { provide: LaundryService, useValue: laundry },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  describe.each(['post', 'patch'] as const)('%s', (verb) => {
    const suffix = verb === 'patch' ? '/1' : '';
    const code = verb === 'post' ? 201 : 200;
    const paymentMock = verb === 'post' ? payments.create : payments.update;
    const laundryMock = verb === 'post' ? laundry.create : laundry.update;

    it.each([
      { method: 'bitcoin' },
      { status: 'whatever' },
      { status: 'Unpaid' },
    ])('rejects payment %j', async (invalid) => {
      const res = await send(`/payments${suffix}`, verb, {
        ...(verb === 'post' ? { bookingId: 1 } : {}),
        method: 'cash',
        ...invalid,
      });
      expect(res.status).toBe(400);
      expect(paymentMock).not.toHaveBeenCalled();
    });
    it.each([{ price: 'abc' }, { price: -5 }, { status: 'whatever' }])(
      'rejects laundry %j',
      async (invalid) => {
        const res = await send(`/laundry${suffix}`, verb, {
          ...(verb === 'post' ? { guestId: 2 } : {}),
          items: 'towels',
          ...invalid,
        });
        expect(res.status).toBe(400);
        expect(laundryMock).not.toHaveBeenCalled();
      },
    );
    it.each([
      'cash',
      'card',
      'mobile',
      'e_birr',
      'cbe',
      'cbe_birr',
      'bank_transfer',
    ])('accepts method %s and parses amount', async (method) => {
      const body = {
        ...(verb === 'post' ? { bookingId: '1' } : {}),
        method,
        status: 'unpaid',
        amount: '250',
        description: 'Room charge',
      };
      await send(`/payments${suffix}`, verb, body, 'reception').expect(code);
      expect(paymentMock.mock.calls[0].at(-1)).toEqual({
        ...body,
        ...(verb === 'post' ? { bookingId: 1 } : {}),
        amount: 250,
      });
    });
    it.each(['paid', 'unpaid', 'refunded', 'failed'])(
      'accepts status %s without optional fields',
      async (status) => {
        const body = {
          ...(verb === 'post' ? { bookingId: 1 } : {}),
          method: 'card',
          status,
        };
        await send(`/payments${suffix}`, verb, body).expect(code);
        expect(paymentMock.mock.calls[0].at(-1)).toEqual(body);
      },
    );
    it('parses laundry price', async () => {
      const body = {
        ...(verb === 'post' ? { guestId: '2' } : {}),
        items: 'towels',
        status: 'pending',
        price: '120',
      };
      await send(`/laundry${suffix}`, verb, body, 'housekeeping').expect(code);
      expect(laundryMock.mock.calls[0].at(-1)).toEqual({
        ...body,
        ...(verb === 'post' ? { guestId: 2 } : {}),
        price: 120,
      });
    });
    it('rejects unknown fields', async () => {
      const res = await send(`/payments${suffix}`, verb, {
        method: 'cash',
        surprise: true,
      });
      expect(res.status).toBe(400);
      expect(paymentMock).not.toHaveBeenCalled();
    });
  });

  it('accepts the guest card form and drops details before the service', async () => {
    await send(
      '/payments',
      'post',
      {
        bookingId: 1,
        method: 'card',
        details: { cardName: 'Test', cardNumber: 'test-only' },
      },
      'reception',
    ).expect(201);
    expect(payments.create).toHaveBeenCalledWith({
      bookingId: 1,
      method: 'card',
    });
    expect(payments.create.mock.calls[0][0].details).toBeUndefined();
  });
  it.each(['DINING', 'OTHER', 'LAUNDRY'])(
    'parses identifiers for %s without a booking',
    async (serviceType) => {
      await send('/payments', 'post', {
        serviceType,
        guestId: '2',
        amount: '25',
        method: 'cash',
      }).expect(201);
      expect(payments.create).toHaveBeenCalledWith({
        serviceType,
        guestId: 2,
        amount: 25,
        method: 'cash',
      });
    },
  );
  it('rejects an unknown service type', async () => {
    const res = await send('/payments', 'post', {
      serviceType: 'INVALID',
      method: 'cash',
    });
    expect(res.status).toBe(400);
    expect(payments.create).not.toHaveBeenCalled();
  });
  it('accepts the laundry create form', async () => {
    const body = {
      guestId: 2,
      items: '2x towels',
      status: 'pending',
      price: 120,
    };
    await send('/laundry', 'post', body, 'housekeeping').expect(201);
    expect(laundry.create).toHaveBeenCalledWith(body);
  });
  it('accepts the laundry edit form', async () => {
    const body = { items: '3x towels', status: 'done' };
    await send('/laundry/1', 'patch', body, 'housekeeping').expect(200);
    expect(laundry.update).toHaveBeenCalledWith(1, body);
  });
  it('uses the real authentication and role guards', async () => {
    await request(app.getHttpServer()).post('/payments').send({}).expect(401);
    await send('/payments', 'post', {}, 'housekeeping').expect(403);
    await request(app.getHttpServer()).post('/laundry').send({}).expect(401);
    await send('/laundry', 'post', {}, 'finance').expect(403);
  });

  it.each(['', ' ', null])(
    'treats a blank amount %j as missing so the service computes it',
    async (amount) => {
      await send(
        '/payments',
        'post',
        { bookingId: 1, method: 'cash', amount },
        'reception',
      ).expect(201);
      expect(payments.create.mock.calls[0][0].amount).toBeUndefined();
    },
  );

  it('does not overwrite an amount with a blank PATCH value', async () => {
    await send('/payments/1', 'patch', { amount: '' }, 'finance').expect(200);
    expect(payments.update.mock.calls[0][1].amount).toBeUndefined();
  });

  it('accepts a lowercase service type as before', async () => {
    await send('/payments', 'post', {
      serviceType: 'dining',
      guestId: 2,
      amount: 25,
      method: 'cash',
    }).expect(201);
    expect(payments.create.mock.calls[0][0].serviceType).toBe('DINING');
  });

  it('rejects a laundryId, since laundry orders record their own payment', async () => {
    await send('/payments', 'post', {
      serviceType: 'LAUNDRY',
      laundryId: 3,
      method: 'cash',
    }).expect(400);
    expect(payments.create).not.toHaveBeenCalled();
  });
});
