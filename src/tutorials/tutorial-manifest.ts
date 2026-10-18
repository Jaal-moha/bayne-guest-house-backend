import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Role } from '@prisma/client';

export const MANIFEST_FILE = 'manifest.json';

export type Tutorial = {
  name: string;
  title: string;
  summary: string;
  group: string;
  primaryRole: string;
  audience: Role[];
  pages: string[];
  durationSec: number;
  video: string;
  poster: string;
  sha256: string;
  recordedAt: string;
  sourceCommit: string;
};

export type Manifest = { version: 1; tutorials: Tutorial[] };

export class ManifestError extends Error {}

const ROLES = new Set<string>(Object.values(Role));
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type Fields = Record<string, unknown>;

function fail(at: string, message: string): never {
  throw new ManifestError(`${MANIFEST_FILE} ${at} ${message}`);
}

function text(entry: Fields, key: string, at: string): string {
  const value = entry[key];
  if (typeof value !== 'string' || value.trim() === '')
    fail(`${at}.${key}`, 'must be a non-empty string');
  return value;
}

function plainName(
  entry: Fields,
  key: string,
  at: string,
  extension = /$/,
): string {
  const value = text(entry, key, at);
  if (!PLAIN_NAME.test(value) || !extension.test(value)) {
    fail(
      `${at}.${key}`,
      `"${value}" must be a plain file name matching ${PLAIN_NAME.source} and ${extension.source}`,
    );
  }
  return value;
}

function parseTutorial(raw: unknown, at: string): Tutorial {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    fail(at, 'must be an object');
  const entry = raw as Fields;

  const audience = entry.audience;
  if (!Array.isArray(audience) || audience.length === 0)
    fail(`${at}.audience`, 'must be a non-empty array of roles');
  for (const role of audience) {
    if (typeof role !== 'string' || !ROLES.has(role)) {
      fail(`${at}.audience`, `holds unknown role ${JSON.stringify(role)}`);
    }
  }

  const pages = entry.pages;
  if (
    !Array.isArray(pages) ||
    !pages.every((page) => typeof page === 'string' && page.startsWith('/'))
  ) {
    fail(`${at}.pages`, 'must be an array of paths starting with "/"');
  }

  const durationSec = entry.durationSec;
  if (
    typeof durationSec !== 'number' ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    fail(`${at}.durationSec`, 'must be a positive number');
  }

  const sha256 = text(entry, 'sha256', at);
  if (!/^[0-9a-f]{64}$/.test(sha256))
    fail(`${at}.sha256`, 'must be 64 lowercase hex characters');

  const recordedAt = text(entry, 'recordedAt', at);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      recordedAt,
    ) ||
    Number.isNaN(Date.parse(recordedAt))
  )
    fail(`${at}.recordedAt`, 'must be an ISO date');

  const sourceCommit = text(entry, 'sourceCommit', at);
  if (!/^[0-9a-f]{7,40}$/.test(sourceCommit))
    fail(`${at}.sourceCommit`, 'must be a git commit SHA');

  return {
    name: plainName(entry, 'name', at),
    title: text(entry, 'title', at),
    summary: text(entry, 'summary', at),
    group: text(entry, 'group', at),
    primaryRole: text(entry, 'primaryRole', at),
    audience: audience as Role[],
    pages: pages as string[],
    durationSec,
    video: plainName(entry, 'video', at, /\.mp4$/),
    poster: plainName(entry, 'poster', at, /\.(jpg|jpeg|png|webp)$/),
    sha256,
    recordedAt,
    sourceCommit,
  };
}

export function parseManifest(raw: unknown): Manifest {
  if (typeof raw !== 'object' || raw === null)
    fail('root', 'must be an object');
  const { version, tutorials } = raw as Fields;
  if (version !== 1)
    fail('version', `must be 1, got ${JSON.stringify(version)}`);
  if (!Array.isArray(tutorials)) fail('tutorials', 'must be an array');

  const parsed = tutorials.map((entry, i) =>
    parseTutorial(entry, `tutorials[${i}]`),
  );
  const seen = new Set<string>();
  for (const tutorial of parsed) {
    if (seen.has(tutorial.name))
      fail('tutorials', `repeats name "${tutorial.name}"`);
    seen.add(tutorial.name);
  }
  return { version: 1, tutorials: parsed };
}

export function mediaFiles(manifest: Manifest): Set<string> {
  return new Set(
    manifest.tutorials.flatMap((tutorial) => [tutorial.video, tutorial.poster]),
  );
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

export async function readManifest(dir: string): Promise<Manifest | null> {
  let body: string;
  try {
    body = await readFile(join(dir, MANIFEST_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (err) {
    throw new ManifestError(
      `${MANIFEST_FILE} is not valid JSON: ${(err as Error).message}`,
    );
  }

  const manifest = parseManifest(json);
  for (const file of mediaFiles(manifest)) {
    if (!(await isRegularFile(join(dir, file)))) {
      throw new ManifestError(
        `${MANIFEST_FILE} names "${file}", which is not a regular file in ${dir}`,
      );
    }
  }
  return manifest;
}
