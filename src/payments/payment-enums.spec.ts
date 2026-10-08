import { LaundryStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

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

  it('holds exactly the values the frontend forms send', () => {
    expect(Object.values(PaymentMethod)).toEqual(['cash', 'card', 'mobile', 'e_birr', 'cbe', 'cbe_birr', 'bank_transfer']);
    expect(Object.values(PaymentStatus)).toEqual(['paid', 'unpaid', 'refunded', 'failed']);
    expect(Object.values(LaundryStatus)).toEqual(['pending', 'in_progress', 'done']);
  });
});
