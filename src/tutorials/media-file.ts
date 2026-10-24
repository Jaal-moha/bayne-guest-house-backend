import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

export async function openMediaFile(dir: string, file: string) {
  const handle = await open(
    join(dir, file),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => null);
  if (!handle) return null;
  let regular = false;
  try {
    regular = (await handle.stat()).isFile();
    return regular ? handle : null;
  } finally {
    if (!regular) await handle.close();
  }
}
