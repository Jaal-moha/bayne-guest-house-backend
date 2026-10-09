import { ConflictException } from '@nestjs/common';
import { PaymentMethod, PaymentServiceType, PaymentStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LaundryService } from './laundry.service';

if (!process.env.DATABASE_URL) {
  throw new Error('Integration tests need DATABASE_URL pointing at a migrated Postgres database.');
}

async function waitForLockWait(observer: PrismaClient) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [{ n }] = await observer.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if (n > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('The delete never blocked on the payment row lock.');
}

describe('LaundryService.remove against Postgres', () => {
  const prisma = new PrismaService();
  const payer = new PrismaClient();
  const observer = new PrismaClient();
  const service = new LaundryService(prisma);
  const name = `laundry-race-${Date.now()}`;

  beforeAll(() => Promise.all([prisma.$connect(), payer.$connect(), observer.$connect()]));
  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { guest: { name } } });
    await prisma.laundry.deleteMany({ where: { guest: { name } } });
    await prisma.guest.deleteMany({ where: { name } });
    await Promise.all([prisma.$disconnect(), payer.$disconnect(), observer.$disconnect()]);
  });

  it('keeps the order and its payment when the payment is marked paid while the delete runs', async () => {
    const guest = await prisma.guest.create({ data: { name, phone: '0911' } });
    const laundry = await prisma.laundry.create({
      data: { guestId: guest.id, items: '2x towels', price: 120 },
    });
    const payment = await prisma.payment.create({
      data: {
        guestId: guest.id,
        laundryId: laundry.id,
        amount: 120,
        method: PaymentMethod.cash,
        status: PaymentStatus.unpaid,
        serviceType: PaymentServiceType.LAUNDRY,
      },
    });

    let markedPaid!: () => void;
    const paidUncommitted = new Promise<void>((r) => (markedPaid = r));
    let commit!: () => void;
    const committing = new Promise<void>((r) => (commit = r));

    const payerTx = payer.$transaction(
      async (tx) => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid } });
        markedPaid();
        await committing;
      },
      { timeout: 15000 },
    );

    await paidUncommitted;
    const removal = service.remove(laundry.id).then(
      () => 'deleted',
      (err: unknown) => err,
    );
    await waitForLockWait(observer);
    commit();
    await payerTx;

    expect(await removal).toBeInstanceOf(ConflictException);
    expect(await prisma.laundry.findUnique({ where: { id: laundry.id } })).not.toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({
      status: PaymentStatus.paid,
    });
  });
});
