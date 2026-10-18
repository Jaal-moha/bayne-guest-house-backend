import { createHmac, timingSafeEqual } from 'node:crypto';

export const MEDIA_URL_TTL_SEC = 60 * 60;

function signature(secret: string, file: string, exp: number): string {
  return createHmac('sha256', secret)
    .update(`${file}\n${exp}`)
    .digest('base64url');
}

export function signMediaPath(
  secret: string,
  file: string,
  nowSec: number,
): string {
  const exp = nowSec + MEDIA_URL_TTL_SEC;
  return `/tutorials/media/${encodeURIComponent(file)}?exp=${exp}&sig=${signature(secret, file, exp)}`;
}

export function isValidMediaSignature(
  secret: string,
  file: string,
  exp: unknown,
  sig: unknown,
  nowSec: number,
): boolean {
  if (
    typeof exp !== 'string' ||
    !/^(?:0|[1-9]\d{0,11})$/.test(exp) ||
    typeof sig !== 'string'
  )
    return false;
  const expSec = Number(exp);
  if (expSec <= nowSec) return false;
  const expected = Buffer.from(signature(secret, file, expSec));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
