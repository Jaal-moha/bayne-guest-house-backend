import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy, jwtSecret } from './jwt.strategy';

// jsonwebtoken reads a unitless string as milliseconds, so '3600' would expire in 3.6 seconds.
function tokenLifetime(value?: string): string | number {
  const lifetime = value?.trim();
  if (!lifetime) return '7d';
  return /^\d+$/.test(lifetime) ? Number(lifetime) : lifetime;
}

@Module({
  imports: [
    UsersModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: jwtSecret(config),
        signOptions: { expiresIn: tokenLifetime(config.get<string>('JWT_EXPIRES_IN')) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
