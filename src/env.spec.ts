import { ConfigService } from '@nestjs/config';
import { envValue, serverConfig } from './env';

const config = (vars: Record<string, string | undefined>) =>
  ({ get: (key: string) => vars[key] }) as unknown as ConfigService;

describe('envValue', () => {
  it('treats a blank or whitespace-only value as unset', () => {
    expect(envValue(config({ A: '' }), 'A')).toBeUndefined();
    expect(envValue(config({ A: '   ' }), 'A')).toBeUndefined();
    expect(envValue(config({}), 'A')).toBeUndefined();
  });

  it('returns a set value without its padding', () => {
    expect(envValue(config({ A: ' 3600 ' }), 'A')).toBe('3600');
  });
});

describe('serverConfig', () => {
  it('defaults to port 3000 and no extra origins', () => {
    expect(serverConfig(config({}))).toEqual({ port: 3000, allowedOrigins: [] });
  });

  it('parses a numeric PORT and a JSON array of origins', () => {
    expect(
      serverConfig(config({ PORT: '8080', ALLOWED_ORIGINS: '["https://a.example","https://b.example"]' })),
    ).toEqual({ port: 8080, allowedOrigins: ['https://a.example', 'https://b.example'] });
  });

  it.each(['abc', '80a', '-1', '1.5', '65536'])('rejects PORT=%s', (port) => {
    expect(() => serverConfig(config({ PORT: port }))).toThrow(
      `PORT must be an integer from 0 to 65535, got "${port}"`,
    );
  });

  it.each(['"https://a.example"', '{"a":1}', 'true', '3', '[1]', 'not json'])(
    'rejects ALLOWED_ORIGINS=%s',
    (origins) => {
      expect(() => serverConfig(config({ ALLOWED_ORIGINS: origins }))).toThrow(
        `ALLOWED_ORIGINS must be a JSON array of strings, got ${origins}`,
      );
    },
  );
});
