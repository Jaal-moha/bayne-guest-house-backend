import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { validationPipeOptions } from '../validation';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('inventory movements over HTTP', () => {
  let app: INestApplication;
  let auth: string;
  const item = { id: 3, name: 'Soap', quantity: 4 };
  const service = {
    findAll: jest.fn().mockResolvedValue([]),
    moveIn: jest.fn().mockResolvedValue(item),
    moveOut: jest.fn().mockResolvedValue(item),
    adjust: jest.fn().mockResolvedValue(item),
    movements: jest
      .fn()
      .mockResolvedValue([{ id: 1, type: 'OUT', quantity: 1 }]),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: 'test-secret' })],
      controllers: [InventoryController],
      providers: [
        JwtStrategy,
        { provide: InventoryService, useValue: service },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
    auth = `Bearer ${moduleRef.get(JwtService).sign({ sub: 1, role: 'store' })}`;
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/inventory/3/movements')
      .set('Authorization', auth)
      .send(body);

  it.each([
    ['IN', 'moveIn', 2],
    ['OUT', 'moveOut', 1],
    ['ADJUST', 'adjust', 0],
  ] as const)(
    'sends a %s movement to the persistent %s',
    async (type, method, quantity) => {
      await post({ type, quantity, reason: 'count' }).expect(201);
      expect(service[method]).toHaveBeenCalledWith(3, quantity, 'count');
    },
  );

  it('rejects a quantity the column cannot hold', async () => {
    await post({ type: 'IN', quantity: 3000000000 }).expect(400);
    expect(service.moveIn).not.toHaveBeenCalled();
  });

  it('rejects an unknown movement type and a fractional quantity', async () => {
    await post({ type: 'LOST', quantity: 1 }).expect(400);
    await post({ type: 'OUT', quantity: 1.5 }).expect(400);
    expect(service.moveOut).not.toHaveBeenCalled();
  });

  it('lists stored movements with the requested limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/inventory/3/movements?limit=200')
      .set('Authorization', auth)
      .expect(200);
    expect(service.movements).toHaveBeenCalledWith(3, 200);
    expect(res.body).toEqual([{ id: 1, type: 'OUT', quantity: 1 }]);
  });

  it('filters the list in the service query', async () => {
    await request(app.getHttpServer())
      .get('/inventory?q=soap&category=bath&low=true')
      .set('Authorization', auth)
      .expect(200);
    expect(service.findAll).toHaveBeenCalledWith({
      q: 'soap',
      category: 'bath',
      low: true,
    });
  });
});
