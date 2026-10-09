import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

type Where = Partial<Pick<User, 'id' | 'password'>>;

// A one-row User table with Prisma's update semantics: update throws on no match, updateMany counts matches.
function userTable(row: User, afterRead: (row: User) => void) {
  const matches = (where: Where) =>
    where.id === row.id && (where.password === undefined || where.password === row.password);
  return {
    get row() {
      return row;
    },
    prisma: {
      user: {
        findUnique: async ({ where }: { where: Where }) => {
          const found = matches(where) ? { ...row } : null;
          afterRead(row);
          return found;
        },
        update: async ({ where, data }: { where: Where; data: Partial<User> }) => {
          if (!matches(where)) throw new Error('Record to update not found');
          Object.assign(row, data);
          return { ...row };
        },
        updateMany: async ({ where, data }: { where: Where; data: Partial<User> }) => {
          if (!matches(where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
  };
}

describe('AuthService.changePassword against a concurrent password write', () => {
  async function staffRow(): Promise<User> {
    return {
      id: 9,
      name: 'Staff',
      email: 'staff@example.com',
      password: await bcrypt.hash('first-pass', 4),
      role: 'reception',
      forceChangePassword: false,
      staffId: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('answers 409 and keeps an admin reset that lands after the current password was checked', async () => {
    const adminHash = await bcrypt.hash('admin-reset-pass', 4);
    const table = userTable(await staffRow(), (row) => {
      Object.assign(row, { password: adminHash, forceChangePassword: true });
    });
    const auth = new AuthService(new UsersService(table.prisma), new JwtService());

    const change = auth.changePassword(9, { currentPassword: 'first-pass', newPassword: 'second-pass' });

    await expect(change).rejects.toThrow(ConflictException);
    expect(table.row.password).toBe(adminHash);
    expect(table.row.forceChangePassword).toBe(true);
  });

  it('stores the new password when nothing wrote in between', async () => {
    const table = userTable({ ...(await staffRow()), forceChangePassword: true }, () => {});
    const auth = new AuthService(new UsersService(table.prisma), new JwtService());

    await auth.changePassword(9, { currentPassword: 'first-pass', newPassword: 'second-pass' });

    expect(await bcrypt.compare('second-pass', table.row.password)).toBe(true);
    expect(table.row.forceChangePassword).toBe(false);
  });
});
