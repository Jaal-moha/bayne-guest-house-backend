import { INestApplication, Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceModule } from './attendance.module';

process.env.JWT_SECRET = 'test-secret';
process.env.ATTENDANCE_API_KEY = 'test-key';

@Module({
  imports: [PassportModule, JwtModule.register({ secret: 'test-secret' })],
  providers: [JwtStrategy],
  exports: [PassportModule, JwtModule],
})
class TestAuthModule {}

describe('Attendance auth', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const prisma = {
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
    staff: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const bearer = (role: string) =>
    `Bearer ${jwt.sign({ sub: 1, email: 'x@example.com', role })}`;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AttendanceModule],
    })
      .overrideModule(AuthModule)
      .useModule(TestAuthModule)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = new JwtService({ secret: 'test-secret' });
  });

  afterAll(() => app.close());

  it('rejects anonymous access to attendance records', async () => {
    await http().get('/attendance').expect(401);
    await http().post('/attendance').send({ staffId: 1 }).expect(401);
    await http().delete('/attendance/1').expect(401);
  });

  it('limits attendance records to admin, manager and reception', async () => {
    await http()
      .get('/attendance')
      .set('Authorization', bearer('housekeeping'))
      .expect(403);
    for (const role of ['admin', 'manager', 'reception']) {
      await http()
        .get('/attendance')
        .set('Authorization', bearer(role))
        .expect(200);
    }
  });

  it('gives reception only the list and delete the attendance page uses', async () => {
    const auth = bearer('reception');
    await http()
      .post('/attendance')
      .set('Authorization', auth)
      .send({ staffId: 1 })
      .expect(403);
    await http().get('/attendance/1').set('Authorization', auth).expect(403);
    await http()
      .patch('/attendance/1')
      .set('Authorization', auth)
      .send({})
      .expect(403);
  });

  it('rejects a scan with an unsigned token', async () => {
    const payload = Buffer.from(JSON.stringify({ role: 'admin' })).toString(
      'base64url',
    );
    await http()
      .post('/attendance/scan')
      .set('Authorization', `Bearer x.${payload}.x`)
      .send({ code: 'EMP-1' })
      .expect(401);
  });

  it('rejects a scan with a token signed by another secret', async () => {
    const token = new JwtService({ secret: 'other' }).sign({
      sub: 1,
      role: 'admin',
    });
    await http()
      .post('/attendance/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'EMP-1' })
      .expect(401);
  });

  it('rejects a scan with an expired token', async () => {
    const token = jwt.sign({
      sub: 1,
      role: 'security',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await http()
      .post('/attendance/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'EMP-1' })
      .expect(401);
  });

  it('accepts a scan with a signed token or the API key', async () => {
    await http()
      .post('/attendance/scan')
      .set('Authorization', bearer('security'))
      .send({ code: 'EMP-1' })
      .expect(404);
    await http()
      .post('/attendance/scan')
      .set('Authorization', bearer('security').replace('Bearer ', ''))
      .send({ code: 'EMP-1' })
      .expect(404);
    await http()
      .post('/attendance/scan')
      .set('x-api-key', 'test-key')
      .send({ code: 'EMP-1' })
      .expect(404);
    await http().post('/attendance/scan').send({ code: 'EMP-1' }).expect(401);
  });
});
