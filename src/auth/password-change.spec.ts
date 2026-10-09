import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AttendanceModule } from '../attendance/attendance.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsModule } from '../rooms/rooms.module';
import { RoomsService } from '../rooms/rooms.service';
import { UsersService } from '../users/users.service';
import { validationPipeOptions } from '../validation';
import { AuthModule } from './auth.module';
import { fakeUsers } from './fake-users';

process.env.JWT_SECRET = 'password-test-secret';

const blocked = {
  statusCode: 403,
  error: 'Forbidden',
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'Change your password to continue',
};

describe('Forced password change', () => {
  let app: INestApplication;
  const users = fakeUsers();
  const http = () => request(app.getHttpServer());

  async function staffMember(forceChangePassword: boolean, password = 'first-pass') {
    const email = `staff${Math.random()}@example.com`;
    const id = users.add({
      role: 'reception',
      email,
      password: await bcrypt.hash(password, 4),
      forceChangePassword,
    });
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return { id, email, login: login.body, auth: `Bearer ${login.body.access_token}` };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        PrismaModule,
        AuthModule,
        RoomsModule,
        AttendanceModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ staff: { findUnique: async () => null } })
      .overrideProvider(UsersService)
      .useValue(users.service)
      .overrideProvider(RoomsService)
      .useValue({ findAll: async () => [] })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });
  afterAll(() => app.close());

  it('tells the client at login whether the change is required', async () => {
    expect((await staffMember(true)).login).toEqual({
      access_token: expect.any(String),
      forceChangePassword: true,
    });
    expect((await staffMember(false)).login).toEqual({
      access_token: expect.any(String),
      forceChangePassword: false,
    });
  });

  it('blocks every other route with a stable reason while the flag is set', async () => {
    const { id, email, auth } = await staffMember(true);

    const me = await http().get('/auth/me').set('Authorization', auth).expect(200);
    expect(me.body.user).toEqual({
      userId: id,
      email,
      role: 'reception',
      name: 'Test reception',
      forceChangePassword: true,
    });
    const rooms = await http().get('/rooms').set('Authorization', auth).expect(403);
    expect(rooms.body).toEqual(blocked);
    const scan = await http()
      .post('/attendance/scan')
      .set('Authorization', auth)
      .send({ code: 'EMP-1' })
      .expect(403);
    expect(scan.body).toEqual(blocked);
  });

  it('unblocks the same token once the password changes', async () => {
    const { id, email, auth } = await staffMember(true);

    await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'first-pass', newPassword: 'second-pass' })
      .expect(204);

    expect(users.get(id)?.forceChangePassword).toBe(false);
    await http().get('/rooms').set('Authorization', auth).expect(200);
    const me = await http().get('/auth/me').set('Authorization', auth).expect(200);
    expect(me.body.user.forceChangePassword).toBe(false);
    await http().post('/auth/login').send({ email, password: 'first-pass' }).expect(401);
    const login = await http()
      .post('/auth/login')
      .send({ email, password: 'second-pass' })
      .expect(201);
    expect(login.body.forceChangePassword).toBe(false);
  });

  it.each([
    [{ currentPassword: 'wrong-pass', newPassword: 'second-pass' }, 'Current password is incorrect'],
    [{ currentPassword: 'first-pass', newPassword: 'first-pass' }, 'New password must differ from the current password'],
    [{ currentPassword: 'first-pass', newPassword: 'short' }, ['newPassword must be longer than or equal to 8 characters']],
    [{ newPassword: 'second-pass' }, ['currentPassword should not be empty', 'currentPassword must be a string']],
    [{ currentPassword: 'first-pass', newPassword: 'é'.repeat(37) }, ['newPassword must be at most 72 bytes']],
  ])('rejects %j with 400 and keeps the flag and password', async (body, message) => {
    const { id, email, auth } = await staffMember(true);

    const res = await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send(body)
      .expect(400);
    expect(res.body.message).toEqual(message);

    expect(users.get(id)?.forceChangePassword).toBe(true);
    await http().post('/auth/login').send({ email, password: 'first-pass' }).expect(201);
    await http().get('/rooms').set('Authorization', auth).expect(403);
  });

  it('refuses a new password that bcrypt would cut back to the current one', async () => {
    const current = 'a'.repeat(72);
    const { id, email, auth } = await staffMember(true, current);

    const res = await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: current, newPassword: `${current}b` })
      .expect(400);
    expect(res.body.message).toEqual(['newPassword must be at most 72 bytes']);

    expect(users.get(id)?.forceChangePassword).toBe(true);
    await http().post('/auth/login').send({ email, password: current }).expect(201);
  });

  it('compares the new password the way bcrypt reads it for an older, longer password', async () => {
    const current = 'a'.repeat(80);
    const { id, auth } = await staffMember(true, current);

    const res = await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: current, newPassword: 'a'.repeat(72) })
      .expect(400);
    expect(res.body.message).toBe('New password must differ from the current password');
    expect(users.get(id)?.forceChangePassword).toBe(true);
  });

  it('lets a user without the flag change their password too', async () => {
    const { auth } = await staffMember(false);
    await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'first-pass', newPassword: 'second-pass' })
      .expect(204);
  });

  it('requires a token to change a password', async () => {
    await http()
      .post('/auth/change-password')
      .send({ currentPassword: 'first-pass', newPassword: 'second-pass' })
      .expect(401);
  });
});
