import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type JwtPayload = { sub: number; email: string; role: string; name?: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // fail fast with a clear message
      throw new Error('JWT_SECRET is not set in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,         // now guaranteed to be a string
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    // becomes req.user
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
  }
}
