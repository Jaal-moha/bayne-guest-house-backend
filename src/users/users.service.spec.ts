import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService.setPassword', () => {
  function service(count: number) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    return { updateMany, users: new UsersService({ user: { updateMany } } as unknown as PrismaService) };
  }

  it('writes only over the hash the caller verified, and clears the forced change in the same update', async () => {
    const { updateMany, users } = service(1);

    expect(await users.setPassword(5, 'verified-hash', 'new-hash')).toBe(true);

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 5, password: 'verified-hash' },
      data: { password: 'new-hash', forceChangePassword: false },
    });
  });

  it('reports false when the stored hash changed since it was verified', async () => {
    expect(await service(0).users.setPassword(5, 'verified-hash', 'new-hash')).toBe(false);
  });
});
