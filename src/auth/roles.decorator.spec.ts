import { Reflector } from '@nestjs/core';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('Roles', () => {
  it('rejects a role name that does not exist at compile time', () => {
    // @ts-expect-error 'admn' is not a Role
    Roles('admn');
  });

  it('stores the roles it is given', () => {
    class Target {}
    Roles('admin', 'store')(Target);
    expect(new Reflector().get(ROLES_KEY, Target)).toEqual(['admin', 'store']);
  });
});
