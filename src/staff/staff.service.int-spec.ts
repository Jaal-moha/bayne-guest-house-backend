import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from './staff.service';

if (!process.env.DATABASE_URL) {
  throw new Error('Integration tests need DATABASE_URL pointing at a migrated Postgres database.');
}

describe('StaffService.create against Postgres', () => {
  const prisma = new PrismaService();
  const service = new StaffService(prisma);
  const name = `rollback-${Date.now()}`;

  beforeAll(() => prisma.$connect());
  afterAll(async () => {
    await prisma.staff.deleteMany({ where: { name } });
    await prisma.$disconnect();
  });

  it('leaves no staff row behind when the user insert fails for a reason other than a taken email', async () => {
    const before = await prisma.staff.count();

    const error = await service
      .create({
        name,
        role: 'security',
        phone: '0911',
        username: `${name}@example.com`,
        password: 'pw',
        // Prisma rejects this before any SQL runs. A database-side error would abort the
        // Postgres transaction and roll it back even if the callback swallowed the error.
        forceChangePassword: 'yes' as unknown as boolean,
      })
      .catch((err: unknown) => err);

    expect(await prisma.staff.count()).toBe(before);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ConflictException);
    expect((error as Error).message).toMatch(/forceChangePassword/);
  });
});
