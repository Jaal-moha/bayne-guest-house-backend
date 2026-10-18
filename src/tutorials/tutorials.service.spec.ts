import {
  cpSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import * as mediaModule from './media-file';
import * as manifestModule from './tutorial-manifest';
import { MEDIA_RETRY_MS, TutorialsService } from './tutorials.service';

const FIXTURES = join(__dirname, 'fixtures');
const STORE_VIDEO = 'store-receive-stock.ca14fc82.mp4';

describe('TutorialsService manifest loading', () => {
  let dir: string;
  let service: TutorialsService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tutorials-service-'));
    cpSync(FIXTURES, dir, { recursive: true });
    service = new TutorialsService({
      dir,
      secret: 'tutorials-service-spec-secret-0123456789',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  const republish = () => {
    const body = readFileSync(join(dir, 'manifest.json'), 'utf8');
    writeFileSync(join(dir, 'manifest.json.tmp'), body);
    renameSync(join(dir, 'manifest.json.tmp'), join(dir, 'manifest.json'));
  };

  it('shares one load between concurrent list and media callers after a manifest change', async () => {
    await service.listFor('reception');
    republish();
    const read = jest.spyOn(manifestModule, 'readManifest');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 ? service.listFor('reception') : service.mediaDir(STORE_VIDEO),
      ),
    );

    expect(read).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r === dir)).toHaveLength(5);
  });

  describe('after a failed load', () => {
    let now: number;
    const advance = (ms: number) => (now += ms);
    beforeEach(() => {
      now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    const publish = (body: string) => {
      writeFileSync(join(dir, 'manifest.json.tmp'), body);
      renameSync(join(dir, 'manifest.json.tmp'), join(dir, 'manifest.json'));
    };
    const media = () =>
      service.mediaDir(STORE_VIDEO).then(
        (found) => found,
        (err: unknown) => err,
      );

    it('reads and logs a manifest that does not parse once, however long it stays broken', async () => {
      publish('{');
      const read = jest.spyOn(manifestModule, 'readManifest');
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      for (let i = 0; i < 20; i++) {
        expect(await media()).toBeInstanceOf(ServiceUnavailableException);
        advance(MEDIA_RETRY_MS);
      }

      expect(read).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('hashes a mismatched video once per retry window, then serves it once the file is fixed', async () => {
      const video = join(dir, STORE_VIDEO);
      const good = readFileSync(video);
      const bad = Buffer.from(good);
      bad[bad.length - 1] ^= 0xff;
      writeFileSync(video, bad);
      const opened = jest.spyOn(mediaModule, 'openMediaFile');
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const passes = () =>
        opened.mock.calls.filter(([, file]) => file === STORE_VIDEO).length;

      for (let i = 0; i < 10; i++) {
        expect(await media()).toBeInstanceOf(ServiceUnavailableException);
        advance(MEDIA_RETRY_MS / 20);
      }
      expect(passes()).toBe(1);
      expect(logged).toHaveBeenCalledTimes(1);

      writeFileSync(video, good);
      advance(MEDIA_RETRY_MS);
      expect(await media()).toBe(dir);
      expect(passes()).toBe(2);
    });

    it('serves a manifest whose video was missing once the file lands and the window passes', async () => {
      const aside = join(dir, 'aside.mp4');
      renameSync(join(dir, STORE_VIDEO), aside);
      republish();
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      expect(await media()).toBeInstanceOf(ServiceUnavailableException);
      renameSync(aside, join(dir, STORE_VIDEO));
      expect(await media()).toBeInstanceOf(ServiceUnavailableException);
      advance(MEDIA_RETRY_MS);
      expect(await media()).toBe(dir);
      expect(await service.listFor('reception')).toHaveLength(2);
    });
  });
});
