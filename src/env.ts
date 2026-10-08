import { ConfigService } from '@nestjs/config';

// A blank or whitespace-only variable counts as unset, so callers apply their defaults.
export function envValue(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key)?.trim();
  return value ? value : undefined;
}

export type ServerConfig = { port: number; allowedOrigins: string[] };

export function serverConfig(config: ConfigService): ServerConfig {
  return {
    port: (envValue(config, 'PORT') ?? 3000) as number,
    allowedOrigins: [...(JSON.parse(envValue(config, 'ALLOWED_ORIGINS') ?? '[]') ?? [])],
  };
}
