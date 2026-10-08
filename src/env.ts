import { ConfigService } from '@nestjs/config';

// A blank or whitespace-only variable counts as unset, so callers apply their defaults.
export function envValue(config: ConfigService, key: string): string | undefined {
  const value = config.get<string>(key)?.trim();
  return value ? value : undefined;
}

export type ServerConfig = { port: number; allowedOrigins: string[] };

export function serverConfig(config: ConfigService): ServerConfig {
  return {
    port: parsePort(envValue(config, 'PORT')),
    allowedOrigins: parseOrigins(envValue(config, 'ALLOWED_ORIGINS')),
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 3000;
  const port = Number(raw);
  // Nest treats a non-numeric port as a Unix socket path, so reject it instead of passing it on.
  if (!/^\d+$/.test(raw) || port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${raw}"`);
  }
  return port;
}

function parseOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  let origins: unknown;
  try {
    origins = JSON.parse(raw);
  } catch {
    origins = undefined;
  }
  if (!Array.isArray(origins) || !origins.every((o) => typeof o === 'string')) {
    throw new Error(`ALLOWED_ORIGINS must be a JSON array of strings, got ${raw}`);
  }
  // CORS compares the Origin header as an exact string, so "https://a.example/" would never match.
  const bad = origins.find((o) => !URL.canParse(o) || new URL(o).origin !== o);
  if (bad !== undefined) {
    throw new Error(`ALLOWED_ORIGINS entry "${bad}" is not an origin (scheme://host[:port], no path or trailing slash)`);
  }
  return origins;
}
