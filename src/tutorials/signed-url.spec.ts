import {
  MEDIA_URL_TTL_SEC,
  isValidMediaSignature,
  signMediaPath,
} from './signed-url';

const SECRET = 'signed-url-spec-secret-0123456789abcdef';
const FILE = 'reception-create-booking.6d3ab696.mp4';
const NOW = 1_800_000_000;

function parts(path: string) {
  const url = new URL(path, 'http://api.test');
  return {
    file: decodeURIComponent(url.pathname.split('/').pop()!),
    exp: url.searchParams.get('exp')!,
    sig: url.searchParams.get('sig')!,
  };
}

describe('signed media URLs', () => {
  const signed = parts(signMediaPath(SECRET, FILE, NOW));

  it('builds /tutorials/media/<file> with an exp one hour out', () => {
    expect(signMediaPath(SECRET, FILE, NOW)).toMatch(
      new RegExp(
        `^/tutorials/media/${FILE.replace(/\./g, '\\.')}\\?exp=${NOW + 3600}&sig=[\\w-]{43}$`,
      ),
    );
    expect(MEDIA_URL_TTL_SEC).toBe(3600);
  });

  it('accepts its own signature before expiry', () => {
    expect(
      isValidMediaSignature(SECRET, signed.file, signed.exp, signed.sig, NOW),
    ).toBe(true);
    expect(
      isValidMediaSignature(
        SECRET,
        signed.file,
        signed.exp,
        signed.sig,
        NOW + 3599,
      ),
    ).toBe(true);
  });

  it('rejects a tampered file', () => {
    expect(
      isValidMediaSignature(
        SECRET,
        'store-receive-stock.ca14fc82.mp4',
        signed.exp,
        signed.sig,
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a tampered exp', () => {
    expect(
      isValidMediaSignature(
        SECRET,
        signed.file,
        String(Number(signed.exp) + 3600),
        signed.sig,
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects a tampered sig and a different secret', () => {
    const flipped = (signed.sig[0] === 'A' ? 'B' : 'A') + signed.sig.slice(1);
    expect(
      isValidMediaSignature(SECRET, signed.file, signed.exp, flipped, NOW),
    ).toBe(false);
    expect(
      isValidMediaSignature(
        `${SECRET}x`,
        signed.file,
        signed.exp,
        signed.sig,
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects an expired exp even with a valid signature', () => {
    const old = parts(signMediaPath(SECRET, FILE, NOW - 3600));
    expect(isValidMediaSignature(SECRET, old.file, old.exp, old.sig, NOW)).toBe(
      false,
    );
    expect(
      isValidMediaSignature(
        SECRET,
        signed.file,
        signed.exp,
        signed.sig,
        NOW + 3600,
      ),
    ).toBe(false);
  });

  it.each([
    ['missing exp', undefined, 'sig'],
    ['missing sig', String(NOW + 60), undefined],
    ['repeated exp', [String(NOW + 60), String(NOW + 60)], 'sig'],
    ['non-numeric exp', '1e12', 'sig'],
    ['noncanonical exp', `0${NOW + 3600}`, 'sig'],
    ['short sig', String(NOW + 60), 'abc'],
  ])('rejects %s', (_label, exp, sig) => {
    expect(isValidMediaSignature(SECRET, FILE, exp, sig, NOW)).toBe(false);
  });
});
