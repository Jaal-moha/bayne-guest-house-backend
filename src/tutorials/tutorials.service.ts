import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role } from '@prisma/client';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { envValue } from '../env';
import { isValidMediaSignature, signMediaPath } from './signed-url';
import {
  MANIFEST_FILE,
  Manifest,
  ManifestError,
  Tutorial,
  mediaFiles,
  readManifest,
} from './tutorial-manifest';

export const TUTORIALS_CONFIG = Symbol('TUTORIALS_CONFIG');

export type TutorialsConfig = { dir: string; secret: string } | null;

export const MIN_SECRET_LENGTH = 32;

export async function tutorialsConfig(
  config: ConfigService,
): Promise<TutorialsConfig> {
  const dir = envValue(config, 'TUTORIALS_DIR');
  if (!dir) return null;
  let secret = envValue(config, 'TUTORIALS_SIGNING_SECRET');
  const secretFile = envValue(config, 'TUTORIALS_SIGNING_SECRET_FILE');
  if (secret && secretFile) {
    throw new Error(
      'Set only one of TUTORIALS_SIGNING_SECRET or TUTORIALS_SIGNING_SECRET_FILE',
    );
  }
  if (secretFile) {
    try {
      secret = (await readFile(secretFile, 'utf8')).trimEnd();
    } catch {
      throw new Error('TUTORIALS_SIGNING_SECRET_FILE could not be read');
    }
  }
  if (!secret)
    throw new Error(
      'TUTORIALS_SIGNING_SECRET or TUTORIALS_SIGNING_SECRET_FILE is required when TUTORIALS_DIR is set',
    );
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `TUTORIALS_SIGNING_SECRET must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return { dir, secret };
}

export type TutorialView = Tutorial & { videoUrl: string; posterUrl: string };

type Loaded = { manifest: Manifest; files: Set<string> } | null;

@Injectable()
export class TutorialsService {
  private readonly logger = new Logger(TutorialsService.name);
  private cached?: { key: string; result: Loaded | ManifestError };

  constructor(
    @Inject(TUTORIALS_CONFIG) private readonly config: TutorialsConfig,
  ) {}

  async listFor(
    role: Role,
    nowSec = Math.floor(Date.now() / 1000),
  ): Promise<TutorialView[]> {
    if (!this.config) return [];
    const { secret } = this.config;
    const loaded = await this.load(this.config.dir);
    if (!loaded) return [];
    return loaded.manifest.tutorials
      .filter((tutorial) => tutorial.audience.includes(role))
      .map((tutorial) => ({
        ...tutorial,
        videoUrl: signMediaPath(secret, tutorial.video, nowSec),
        posterUrl: signMediaPath(secret, tutorial.poster, nowSec),
      }));
  }

  async mediaDir(file: string): Promise<string | null> {
    if (!this.config) return null;
    const loaded = await this.load(this.config.dir);
    return loaded?.files.has(file) ? this.config.dir : null;
  }

  isSigned(
    file: string,
    exp: unknown,
    sig: unknown,
    nowSec = Math.floor(Date.now() / 1000),
  ): boolean {
    return (
      !!this.config &&
      isValidMediaSignature(this.config.secret, file, exp, sig, nowSec)
    );
  }

  private async load(dir: string): Promise<Loaded> {
    const key = await stat(join(dir, MANIFEST_FILE)).then(
      (s) => `${s.ino}:${s.size}:${s.mtimeMs}`,
      () => 'absent',
    );
    if (this.cached?.key !== key) {
      const result = await readManifest(dir).then(
        (manifest): Loaded | ManifestError =>
          manifest ? { manifest, files: mediaFiles(manifest) } : null,
        (err: unknown) => {
          if (err instanceof ManifestError) return err;
          throw err;
        },
      );
      if (result instanceof ManifestError) this.logger.error(result.message);
      this.cached = { key, result };
    }
    const { result } = this.cached;
    if (result instanceof ManifestError)
      throw new ServiceUnavailableException('Tutorial manifest is invalid');
    return result;
  }
}
