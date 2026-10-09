import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import type { Role } from '@prisma/client';
import { JwtStrategy } from '../auth/jwt.strategy';
import { fakeUsers } from '../auth/fake-users';
import { UsersService } from '../users/users.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController auth', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const users = fakeUsers();
  const tokenFor = (role: Role) =>
    `Bearer ${jwt.sign({ sub: users.add({ role }) })}`;

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
        ConfigService,
        { provide: UsersService, useValue: users.service },
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
      .set('Authorization', tokenFor('finance'))
      .expect(403);
  });

  it.each(['store', 'barista', 'reception'] as const)(
    'allows the %s role',
    async (role) => {
      await request(app.getHttpServer())
        .get('/inventory')
        .set('Authorization', tokenFor(role))
        .expect(200);
    },
  );

  it.each(['barista', 'reception'] as const)(
    'stops %s from overwriting a quantity outside the movement log',
    async (role) => {
      await request(app.getHttpServer())
        .patch('/inventory/1')
        .set('Authorization', tokenFor(role))
        .send({ quantity: 99 })
        .expect(403);
    },
  );
});
