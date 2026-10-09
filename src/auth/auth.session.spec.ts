import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AttendanceScanController } from '../attendance/attendance-scan.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { fakeUsers } from './fake-users';

process.env.JWT_SECRET = 'session-test-secret';

describe('JWT sessions follow the user row', () => {
  let app: INestApplication;
  const users = fakeUsers();
  const jwt = new JwtService({ secret: 'session-test-secret' });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: 'session-test-secret' })],
      controllers: [AuthController, RoomsController, AttendanceScanController],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: UsersService, useValue: users.service },
        { provide: AuthService, useValue: {} },
        { provide: RoomsService, useValue: { create: async () => ({ id: 1 }) } },
        { provide: PrismaService, useValue: { staff: { findUnique: async () => null } } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('takes the role from the database, not from the token', async () => {
    const id = users.add({ role: 'admin', name: 'Sara', email: 'sara@example.com' });
    const token = `Bearer ${jwt.sign({ sub: id, email: 'sara@example.com', role: 'admin', name: 'Sara' })}`;
    const room = { number: '101', type: 'single', price: 900 };

    await http().post('/rooms').set('Authorization', token).send(room).expect(201);

    users.update(id, { role: 'reception', email: 'sara.t@example.com', name: 'Sara T' });
    await http().post('/rooms').set('Authorization', token).send(room).expect(403);
    const me = await http().get('/auth/me').set('Authorization', token).expect(200);
    expect(me.body).toEqual({
      user: { userId: id, email: 'sara.t@example.com', role: 'reception', name: 'Sara T' },
    });
  });

  it('reports a failed user lookup on the scan as a server error, not bad credentials', async () => {
    const id = users.add({ role: 'security' });
    const token = `Bearer ${jwt.sign({ sub: id, role: 'security' })}`;
    const findById = users.service.findById;
    users.service.findById = async () => {
      throw new Error('database unavailable');
    };
    try {
      await http().post('/attendance/scan').set('Authorization', token).send({ code: 'EMP-1' }).expect(500);
    } finally {
      users.service.findById = findById;
    }
  });

  it('answers 401 once the user is deleted', async () => {
    const id = users.add({ role: 'security' });
    const token = `Bearer ${jwt.sign({ sub: id, role: 'security' })}`;
    await http().get('/auth/me').set('Authorization', token).expect(200);
    await http().post('/attendance/scan').set('Authorization', token).send({ code: 'EMP-1' }).expect(404);

    users.remove(id);
    await http().get('/auth/me').set('Authorization', token).expect(401);
    await http().post('/rooms').set('Authorization', token).send({}).expect(401);
    await http().post('/attendance/scan').set('Authorization', token).send({ code: 'EMP-1' }).expect(401);
  });
});
