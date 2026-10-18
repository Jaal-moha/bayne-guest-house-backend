import { ConfigService } from '@nestjs/config';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tutorialsConfig } from './tutorials.service';

const SECRET = 'tutorials-config-spec-secret-0123456789';

describe('tutorial signing key configuration', () => {
  let dir: string;
  let keyFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tutorial-key-'));
    keyFile = join(dir, 'signing-key');
    writeFileSync(keyFile, `${SECRET}\n`);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const config = (values: Record<string, string>) =>
    new ConfigService({
      TUTORIALS_DIR: '',
      TUTORIALS_SIGNING_SECRET: '',
      TUTORIALS_SIGNING_SECRET_FILE: '',
      ...values,
    });

  it('loads the mounted key and removes its trailing newline', async () => {
    await expect(
      tutorialsConfig(
        config({
          TUTORIALS_DIR: dir,
          TUTORIALS_SIGNING_SECRET_FILE: keyFile,
        }),
      ),
    ).resolves.toEqual({ dir, secret: SECRET });
  });

  it('rejects conflicting key sources without disclosing their values', async () => {
    await expect(
      tutorialsConfig(
        config({
          TUTORIALS_DIR: dir,
          TUTORIALS_SIGNING_SECRET: SECRET,
          TUTORIALS_SIGNING_SECRET_FILE: keyFile,
        }),
      ),
    ).rejects.toThrow(
      'Set only one of TUTORIALS_SIGNING_SECRET or TUTORIALS_SIGNING_SECRET_FILE',
    );
  });

  it('rejects an unreadable key file without exposing its path', async () => {
    await expect(
      tutorialsConfig(
        config({
          TUTORIALS_DIR: dir,
          TUTORIALS_SIGNING_SECRET_FILE: join(dir, 'missing'),
        }),
      ),
    ).rejects.toThrow('TUTORIALS_SIGNING_SECRET_FILE could not be read');
  });

  it.each(['', '\n', 'short\n'])(
    'rejects an empty or short key file %p',
    async (key) => {
      writeFileSync(keyFile, key);
      await expect(
        tutorialsConfig(
          config({
            TUTORIALS_DIR: dir,
            TUTORIALS_SIGNING_SECRET_FILE: keyFile,
          }),
        ),
      ).rejects.toThrow();
    },
  );

  it('does not read a configured key file while the store is disabled', async () => {
    await expect(
      tutorialsConfig(
        config({
          TUTORIALS_SIGNING_SECRET_FILE: join(dir, 'missing'),
        }),
      ),
    ).resolves.toBeNull();
  });
});
