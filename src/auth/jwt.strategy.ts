import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import { envValue } from '../env';
import { UsersService } from '../users/users.service';
import { ExtractJwt, Strategy } from 'passport-jwt';

export function jwtSecret(config: ConfigService): string {
  const secret = envValue(config, 'JWT_SECRET');
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export type SessionUser = { userId: number; email: string; role: Role; name: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret(config),
      ignoreExpiration: false,
    });
  }

  // Reloads the user on every request, so a deleted user is refused and a role change applies to old tokens.
  async validate(payload: { sub?: unknown }): Promise<SessionUser> {
    if (typeof payload.sub !== 'number') throw new UnauthorizedException();
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return { userId: user.id, email: user.email, role: user.role, name: user.name };
  }
}
