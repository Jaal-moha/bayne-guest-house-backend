import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMediaFile } from './media-file';

describe('openMediaFile', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tutorial-open-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('pins the original regular file when its path is swapped for a symlink', async () => {
    const path = join(dir, 'clip.mp4');
    writeFileSync(path, 'original-video');
    const handle = await openMediaFile(dir, 'clip.mp4');
    expect(handle).not.toBeNull();
    if (!handle) throw new Error('expected an opened media file');
    try {
      unlinkSync(path);
      symlinkSync('/etc/hostname', path);
      expect(await handle.readFile('utf8')).toBe('original-video');
      expect(await openMediaFile(dir, 'clip.mp4')).toBeNull();
    } finally {
      await handle.close();
    }
  });

  it('refuses directories and absent files', async () => {
    await expect(openMediaFile(dir, '.')).resolves.toBeNull();
    await expect(openMediaFile(dir, 'missing.mp4')).resolves.toBeNull();
  });
});
