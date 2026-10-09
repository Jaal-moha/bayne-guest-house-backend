import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService.setPassword', () => {
  it('stores the hash and clears the forced change in one update', async () => {
    const update = jest.fn().mockResolvedValue({});
    const users = new UsersService({ user: { update } } as unknown as PrismaService);

    await users.setPassword(5, 'new-hash');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { password: 'new-hash', forceChangePassword: false },
    });
  });
});
