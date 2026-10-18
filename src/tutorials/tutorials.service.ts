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
  ManifestMediaError,
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
      `${secretFile ? 'TUTORIALS_SIGNING_SECRET_FILE' : 'TUTORIALS_SIGNING_SECRET'} must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return { dir, secret };
}

export type TutorialView = Tutorial & { videoUrl: string; posterUrl: string };

type Loaded = { manifest: Manifest; files: Set<string> } | null;

/**
 * How long a manifest whose media failed to load waits before the next request retries it.
 * The publisher copies media before it renames the manifest in, so a media error means a copy
 * is still in flight; each retry re-hashes every video (1 to 2 s for the 42-entry store).
 */
export const MEDIA_RETRY_MS = 5_000;

type Load = { key: string; result: Promise<Loaded>; retryAt?: number };

function isStorageError(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof err.code === 'string'
  );
}

@Injectable()
export class TutorialsService {
  private readonly logger = new Logger(TutorialsService.name);
  private cached?: Load;
  private loggedKey?: string;

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
    let entry = this.cached;
    if (entry?.key !== key || Date.now() >= (entry.retryAt ?? Infinity)) {
      const loading: Load = {
        key,
        result: readManifest(dir).then(
          (manifest): Loaded =>
            manifest ? { manifest, files: mediaFiles(manifest) } : null,
        ),
      };
      // Concurrent callers share this load. A parse error stays cached until the manifest
      // changes; any other failure is retried once MEDIA_RETRY_MS has passed.
      loading.result.catch((err: unknown) => {
        if (
          !(err instanceof ManifestError) ||
          err instanceof ManifestMediaError
        )
          loading.retryAt = Date.now() + MEDIA_RETRY_MS;
        const message =
          err instanceof ManifestError
            ? err.message
            : `Tutorial storage could not be read (${isStorageError(err) ? err.code : 'unknown'})`;
        if (this.loggedKey !== key) this.logger.error(message);
        this.loggedKey = key;
      });
      entry = this.cached = loading;
    }
    try {
      return await entry.result;
    } catch (err) {
      if (err instanceof ManifestError)
        throw new ServiceUnavailableException('Tutorial manifest is invalid');
      throw new ServiceUnavailableException('Tutorial storage is unavailable');
    }
  }
}
