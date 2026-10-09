import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Role } from '@prisma/client';
import { envValue } from '../env';
import { UsersService } from '../users/users.service';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';

export function jwtSecret(config: ConfigService): string {
  const secret = envValue(config, 'JWT_SECRET');
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export type SessionUser = {
  userId: number;
  email: string;
  role: Role;
  name: string;
  forceChangePassword: boolean;
};

// The frontend matches on `code`, so it must not change.
export const PASSWORD_CHANGE_REQUIRED = {
  statusCode: 403,
  error: 'Forbidden',
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'Change your password to continue',
};

// Routes a user may call while forceChangePassword is set use AuthGuard(PASSWORD_CHANGE_JWT) instead of AuthGuard('jwt').
export const PASSWORD_CHANGE_JWT = 'jwt-password-change';

function tokenOptions(config: ConfigService): StrategyOptionsWithoutRequest {
  return {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: jwtSecret(config),
    ignoreExpiration: false,
  };
}

// Reloads the user on every request, so a deleted user is refused and a role change applies to old tokens.
async function loadSessionUser(users: UsersService, payload: { sub?: unknown }): Promise<SessionUser> {
  if (typeof payload.sub !== 'number') throw new UnauthorizedException();
  const user = await users.findById(payload.sub);
  if (!user) throw new UnauthorizedException();
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    forceChangePassword: user.forceChangePassword,
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super(tokenOptions(config));
  }

  async validate(payload: { sub?: unknown }): Promise<SessionUser> {
    const user = await loadSessionUser(this.users, payload);
    if (user.forceChangePassword) throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED);
    return user;
  }
}

@Injectable()
export class PasswordChangeJwtStrategy extends PassportStrategy(Strategy, PASSWORD_CHANGE_JWT) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super(tokenOptions(config));
  }

  validate(payload: { sub?: unknown }): Promise<SessionUser> {
    return loadSessionUser(this.users, payload);
  }
}
