import type { Role, User } from '@prisma/client';

// An in-memory UsersService for HTTP specs, so JwtStrategy reloads users the way it does against Postgres.
export function fakeUsers() {
  const rows = new Map<number, User>();
  let nextId = 1;
  return {
    service: {
      findById: async (id: number) => rows.get(id) ?? null,
      findByEmail: async (email: string) =>
        [...rows.values()].find((user) => user.email === email) ?? null,
      setPassword: async (id: number, password: string) => {
        rows.set(id, { ...rows.get(id)!, password, forceChangePassword: false });
      },
    },
    add(fields: Partial<User> & { role: Role }): number {
      const id = nextId++;
      rows.set(id, {
        id,
        name: `Test ${fields.role}`,
        email: `user${id}@example.com`,
        password: '',
        forceChangePassword: false,
        staffId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...fields,
      });
      return id;
    },
    get(id: number) {
      return rows.get(id);
    },
    update(id: number, fields: Partial<User>) {
      rows.set(id, { ...rows.get(id)!, ...fields });
    },
    remove(id: number) {
      rows.delete(id);
    },
  };
}
