import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ManifestError,
  mediaFiles,
  parseManifest,
  readManifest,
} from './tutorial-manifest';

const FIXTURES = join(__dirname, 'fixtures');
const fixture = () =>
  parseManifest(
    JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8')),
  );
const withEntry = (patch: Record<string, unknown>) => {
  const manifest = fixture();
  manifest.tutorials[0] = { ...manifest.tutorials[0], ...patch };
  return manifest;
};

describe('parseManifest', () => {
  it('accepts the fixture manifest unchanged', () => {
    const manifest = parseManifest(fixture());
    expect(manifest).toEqual(fixture());
    expect(manifest.tutorials.map((t) => t.name)).toEqual([
      'admin-add-staff',
      'anyone-login-wrong-password',
      'reception-create-booking',
      'store-receive-stock',
    ]);
    expect([...mediaFiles(manifest)].sort()).toEqual([
      'reception-create-booking.24f394c2.jpg',
      'reception-create-booking.6d3ab696.mp4',
      'store-receive-stock.ab2a9e4d.jpg',
      'store-receive-stock.ca14fc82.mp4',
    ]);
  });

  it('rejects an entry with an unknown role and names it', () => {
    expect(() =>
      parseManifest(withEntry({ audience: ['admin', 'chef'] })),
    ).toThrow('manifest.json tutorials[0].audience holds unknown role "chef"');
  });

  it.each([
    ['a path in video', { video: '../.env' }, 'tutorials[0].video'],
    ['a nested path in poster', { poster: 'sub/x.jpg' }, 'tutorials[0].poster'],
    ['a dotfile video', { video: '.hidden.mp4' }, 'tutorials[0].video'],
    ['a video that is not mp4', { video: 'x.webm' }, 'tutorials[0].video'],
    ['an empty audience', { audience: [] }, 'tutorials[0].audience'],
    [
      'an undefined audience role',
      { audience: [undefined] },
      'tutorials[0].audience',
    ],
    [
      'a non-ISO timestamp',
      { recordedAt: '2026-10-18' },
      'tutorials[0].recordedAt',
    ],
    ['a page without a slash', { pages: ['staff'] }, 'tutorials[0].pages'],
    ['a zero duration', { durationSec: 0 }, 'tutorials[0].durationSec'],
    ['a short sha256', { sha256: 'abc' }, 'tutorials[0].sha256'],
    [
      'a bad recordedAt',
      { recordedAt: 'yesterday' },
      'tutorials[0].recordedAt',
    ],
    ['a missing title', { title: undefined }, 'tutorials[0].title'],
  ])('rejects %s', (_label, patch, at) => {
    expect(() => parseManifest(withEntry(patch))).toThrow(ManifestError);
    expect(() => parseManifest(withEntry(patch))).toThrow(at);
  });

  it('rejects a repeated name, a wrong version, and a non-object', () => {
    const repeated = fixture();
    repeated.tutorials[1].name = repeated.tutorials[0].name;
    expect(() => parseManifest(repeated)).toThrow(
      'repeats name "admin-add-staff"',
    );
    expect(() => parseManifest({ ...fixture(), version: 2 })).toThrow(
      'version must be 1',
    );
    expect(() => parseManifest([])).toThrow(ManifestError);
  });
});

describe('readManifest', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tutorials-'));
    cpSync(FIXTURES, dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the fixture directory', async () => {
    expect((await readManifest(dir))?.tutorials).toHaveLength(4);
  });

  it('returns null when nothing has been published', async () => {
    unlinkSync(join(dir, 'manifest.json'));
    expect(await readManifest(dir)).toBeNull();
    expect(await readManifest(join(dir, 'missing-dir'))).toBeNull();
  });

  it('rejects a manifest that names a missing file', async () => {
    unlinkSync(join(dir, 'store-receive-stock.ca14fc82.mp4'));
    await expect(readManifest(dir)).rejects.toThrow(
      'names "store-receive-stock.ca14fc82.mp4", which is not a regular file',
    );
  });

  it('rejects a media name that is a symlink', async () => {
    unlinkSync(join(dir, 'store-receive-stock.ca14fc82.mp4'));
    symlinkSync('/etc/hostname', join(dir, 'store-receive-stock.ca14fc82.mp4'));
    await expect(readManifest(dir)).rejects.toThrow(ManifestError);
  });

  it('rejects malformed JSON as a ManifestError', async () => {
    writeFileSync(join(dir, 'manifest.json'), '{"version": 1, "tutorials": [');
    await expect(readManifest(dir)).rejects.toThrow(
      'manifest.json is not valid JSON',
    );
  });
});
