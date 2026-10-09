import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy, PasswordChangeJwtStrategy, jwtSecret } from './jwt.strategy';
import { envValue } from '../env';

// jsonwebtoken reads a unitless string as milliseconds, so '3600' would expire in 3.6 seconds.
function tokenLifetime(config: ConfigService): string | number {
  const lifetime = envValue(config, 'JWT_EXPIRES_IN') ?? '7d';
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
        signOptions: { expiresIn: tokenLifetime(config) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordChangeJwtStrategy],
  exports: [PassportModule, JwtModule, JwtStrategy],
})
export class AuthModule {}
