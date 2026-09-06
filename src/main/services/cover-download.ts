import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertWithin } from '../../shared/paths';

export interface CoverHttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface CoverHttpClient {
  fetch(url: string, init?: { signal?: AbortSignal }): Promise<CoverHttpResponse>;
}

const MAX_COVER_BYTES = 8 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Cover download cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

function contentType(response: CoverHttpResponse): string {
  return (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

function declaredLength(response: CoverHttpResponse): number | null {
  const value = response.headers.get('content-length');
  if (!value) return null;
  const length = Number(value);
  return Number.isFinite(length) && length >= 0 ? length : null;
}

/** Download a validated remote image into the game's local cover slot. */
export async function downloadCover(
  url: string,
  targetDirectory: string,
  signal: AbortSignal,
  http: CoverHttpClient,
): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS cover URLs are allowed');
  }

  await mkdir(targetDirectory, { recursive: true });
  throwIfAborted(signal);
  const response = await http.fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Cover request failed with status ${response.status}`);
  }

  const extension = EXTENSIONS[contentType(response)];
  if (!extension) {
    throw new Error('Cover response is not a supported image type');
  }
  if (declaredLength(response) !== null && declaredLength(response)! > MAX_COVER_BYTES) {
    throw new Error('Cover image is too large');
  }

  const temporaryPath = assertWithin(path.join(targetDirectory, `.${randomUUID()}.cover.tmp`), targetDirectory);
  const finalPath = assertWithin(path.join(targetDirectory, `.cover${extension}`), targetDirectory);
  let complete = false;
  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    throwIfAborted(signal);
    if (bytes.byteLength > MAX_COVER_BYTES) {
      throw new Error('Cover image is too large');
    }
    await writeFile(temporaryPath, bytes, { flag: 'wx' });
    throwIfAborted(signal);
    await rm(finalPath, { force: true });
    await rename(temporaryPath, finalPath);
    complete = true;
    return finalPath;
  } finally {
    if (!complete) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}
