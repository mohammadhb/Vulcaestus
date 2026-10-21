import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../env.js';

export function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'file';
}

export function storagePath(...parts: string[]): string {
  const base = resolve(env.STORAGE_DIR);
  const target = resolve(join(base, ...parts));
  if (!target.startsWith(base)) throw new Error('Invalid storage path');
  return target;
}

export async function writeStorageFile(
  parts: string[],
  content: Buffer | string,
): Promise<{ path: string; relativePath: string }> {
  const path = storagePath(...parts);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return {
    path,
    relativePath: parts.join('/'),
  };
}
