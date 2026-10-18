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
import * as manifestModule from './tutorial-manifest';
import { TutorialsService } from './tutorials.service';

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
});
