import { Prisma } from '@prisma/client';

describe('payment and laundry enums', () => {
  it('makes a value outside the enums a compile error', () => {
    const known: Prisma.PaymentWhereInput = { status: 'paid', method: 'cash' };
    // @ts-expect-error 'Paid' is not a PaymentStatus
    const wrongStatus: Prisma.PaymentWhereInput = { status: 'Paid' };
    // @ts-expect-error 'bitcoin' is not a PaymentMethod
    const wrongMethod: Prisma.PaymentWhereInput = { method: 'bitcoin' };
    // @ts-expect-error 'Done' is not a LaundryStatus
    const wrongLaundry: Prisma.LaundryWhereInput = { status: 'Done' };
    expect([known, wrongStatus, wrongMethod, wrongLaundry]).toHaveLength(4);
  });
});
