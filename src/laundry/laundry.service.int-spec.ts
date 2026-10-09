import { ConflictException } from '@nestjs/common';
import { PaymentMethod, PaymentServiceType, PaymentStatus, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LaundryService } from './laundry.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Integration tests need DATABASE_URL pointing at a migrated Postgres database.');
}

// The remover's transaction runs on whichever pooled connection Prisma hands it, and the
// test cannot run a query inside it to learn its pid. Tagging every connection the remover
// client opens with a unique application_name identifies it whatever the pool size.
async function waitUntilBlockedBy(observer: PrismaClient, applicationName: string, blockerPid: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await observer.$queryRaw<{ blocked: boolean }[]>`
      select exists (
        select 1 from pg_stat_activity
        where application_name = ${applicationName}
          and ${blockerPid}::int = any(pg_blocking_pids(pid))
      ) as blocked`;
    if (blocked) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('The delete never blocked on the payer transaction.');
}

describe('LaundryService.remove against Postgres', () => {
  const name = `laundry-race-${Date.now()}`;
  const removerUrl = new URL(databaseUrl);
  removerUrl.searchParams.set('application_name', name);
  const prisma = new PrismaService({ datasources: { db: { url: removerUrl.toString() } } });
  const payer = new PrismaClient();
  const observer = new PrismaClient();
  const service = new LaundryService(prisma);

  beforeAll(() => Promise.all([prisma.$connect(), payer.$connect(), observer.$connect()]));
  afterAll(async () => {
    try {
      await prisma.payment.deleteMany({ where: { guest: { name } } });
      await prisma.laundry.deleteMany({ where: { guest: { name } } });
      await prisma.guest.deleteMany({ where: { name } });
    } finally {
      await Promise.all([prisma.$disconnect(), payer.$disconnect(), observer.$disconnect()]);
    }
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

    let payerPid = 0;
    let markedPaid!: () => void;
    const paidUncommitted = new Promise<void>((r) => (markedPaid = r));
    let commit!: () => void;
    const committing = new Promise<void>((r) => (commit = r));

    const payerTx = payer.$transaction(
      async (tx) => {
        [{ pid: payerPid }] = await tx.$queryRaw<{ pid: number }[]>`select pg_backend_pid() as pid`;
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.paid } });
        markedPaid();
        await committing;
      },
      { timeout: 15000 },
    );
    let removal: Promise<unknown> | undefined;

    try {
      await Promise.race([paidUncommitted, payerTx]);
      removal = service.remove(laundry.id).then(
        () => 'deleted',
        (err: unknown) => err,
      );
      await waitUntilBlockedBy(observer, name, payerPid);
    } finally {
      commit();
      await Promise.allSettled([payerTx, removal]);
    }

    await payerTx;
    expect(await removal).toBeInstanceOf(ConflictException);
    expect(await prisma.laundry.findUnique({ where: { id: laundry.id } })).not.toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({
      status: PaymentStatus.paid,
    });
  });
});
