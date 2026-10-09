import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { fakeUsers } from '../auth/fake-users';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { validationPipeOptions } from '../validation';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

process.env.JWT_SECRET = 'length-test-secret';

describe('Passwords longer than bcrypt reads', () => {
  let app: INestApplication;
  const users = fakeUsers();
  const createForStaff = jest.fn().mockResolvedValue({ id: 1 });
  const staff = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const jwt = new JwtService({ secret: 'length-test-secret' });
  const adminId = users.add({ role: 'admin' });
  const auth = `Bearer ${jwt.sign({ sub: adminId, role: 'admin' })}`;
  const http = () => request(app.getHttpServer());

  const fits = 'é'.repeat(36);
  const tooLong = 'é'.repeat(37);
  const newStaff = { name: 'Hanna', role: 'reception', phone: '0911000555', username: 'hanna@example.com' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: 'length-test-secret' })],
      controllers: [StaffController, UsersController],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: UsersService, useValue: { ...users.service, createForStaff } },
        { provide: StaffService, useValue: staff },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['POST', '/staff', newStaff, staff.create],
    ['PUT', '/staff/1', {}, staff.update],
    ['POST', '/users/staff/1', { email: 'hanna@example.com' }, createForStaff],
  ] as const)('%s %s rejects a password over 72 UTF-8 bytes and accepts 72', async (method, path, body, handler) => {
    const send = (password: string) =>
      (method === 'PUT' ? http().put(path) : http().post(path))
        .set('Authorization', auth)
        .send({ ...body, password });

    const res = await send(tooLong).expect(400);
    expect(res.body.message).toEqual(['password must be at most 72 bytes']);
    expect(handler).not.toHaveBeenCalled();

    await send(fits).expect(method === 'PUT' ? 200 : 201);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
