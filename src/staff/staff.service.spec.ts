import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from './staff.service';

jest.mock('pdfkit', () => jest.fn());
jest.mock('bwip-js', () => ({ toBuffer: jest.fn() }));

const duplicateEmail = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['email'] },
  });

describe('StaffService writes', () => {
  const staff = { id: 7, name: 'Dawit', role: 'security', barcode: 'EMP-000001', user: null };
  const make = () => {
    const tx = {
      staff: {
        create: jest.fn().mockResolvedValue(staff),
        update: jest.fn().mockResolvedValue(staff),
        delete: jest.fn().mockResolvedValue(staff),
        findUniqueOrThrow: jest.fn().mockResolvedValue(staff),
      },
      user: {
        create: jest.fn().mockRejectedValue(duplicateEmail()),
        update: jest.fn().mockRejectedValue(duplicateEmail()),
        delete: jest.fn().mockResolvedValue({ id: 2 }),
      },
    };
    const prisma = {
      staff: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(staff),
        update: jest.fn().mockResolvedValue(staff),
        delete: jest.fn().mockResolvedValue(staff),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { tx, prisma, service: new StaffService(prisma as unknown as PrismaService) };
  };

  it('answers a taken email with 409 and leaves no staff row behind', async () => {
    const { tx, prisma, service } = make();
    await expect(
      service.create({ name: 'Dawit', role: 'security', phone: '0911', username: 'taken@x.com', password: 'pw' }),
    ).rejects.toThrow(ConflictException);
    expect(tx.staff.create).toHaveBeenCalledTimes(1);
    expect(prisma.staff.create).not.toHaveBeenCalled();
  });

  it('answers a taken email on update with 409 inside the same transaction', async () => {
    const { tx, prisma, service } = make();
    prisma.staff.findUnique.mockResolvedValue({ ...staff, user: { id: 2, email: 'old@x.com' } });
    await expect(service.update(7, { username: 'taken@x.com' })).rejects.toThrow(ConflictException);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.staff.update).not.toHaveBeenCalled();
  });

  it('deletes the user and the staff row in one transaction', async () => {
    const { tx, prisma, service } = make();
    prisma.staff.findUnique.mockResolvedValue({ ...staff, user: { id: 2, email: 'old@x.com' } });
    await service.delete(7);
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(tx.staff.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.staff.delete).not.toHaveBeenCalled();
  });
});
