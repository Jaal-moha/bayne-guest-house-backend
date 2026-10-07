import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtStrategy } from '../auth/jwt.strategy';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController auth', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const tokenFor = (role: string) =>
    `Bearer ${jwt.sign({ sub: 1, email: 'x@example.com', role })}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      controllers: [InventoryController],
      providers: [
        JwtStrategy,
        {
          provide: InventoryService,
          useValue: {
            findAll: async () => [],
            create: async () => ({ id: 1 }),
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());

  it('rejects anonymous reads and writes', async () => {
    await request(app.getHttpServer()).get('/inventory').expect(401);
    await request(app.getHttpServer())
      .post('/inventory')
      .send({ name: 'Soap', quantity: 1 })
      .expect(401);
  });

  it('rejects a role outside inventory', async () => {
    await request(app.getHttpServer())
      .get('/inventory')
      .set('Authorization', tokenFor('barista'))
      .expect(403);
  });

  it('allows the store role', async () => {
    await request(app.getHttpServer())
      .get('/inventory')
      .set('Authorization', tokenFor('store'))
      .expect(200);
  });
});
