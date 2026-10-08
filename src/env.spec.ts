import { ConfigService } from '@nestjs/config';
import { envValue } from './env';

describe('envValue', () => {
  const config = (vars: Record<string, string | undefined>) =>
    ({ get: (key: string) => vars[key] }) as unknown as ConfigService;

  it('treats a blank or whitespace-only value as unset', () => {
    expect(envValue(config({ A: '' }), 'A')).toBeUndefined();
    expect(envValue(config({ A: '   ' }), 'A')).toBeUndefined();
    expect(envValue(config({}), 'A')).toBeUndefined();
  });

  it('returns a set value without its padding', () => {
    expect(envValue(config({ A: ' 3600 ' }), 'A')).toBe('3600');
  });
});
