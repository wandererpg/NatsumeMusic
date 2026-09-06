import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { openDecodedOwpStream } from './owp';

export interface CopyFileOptions {
  /** Abort an in-flight stream copy without waiting for the source to finish. */
  signal?: AbortSignal;
}

/**
 * Copy a file through streams, creating the destination directory first.
 * Resolving on `close` ensures the destination descriptor has been closed and
 * all bytes are available to a subsequent hash/stat operation.
 */
export async function copyFileStreaming(
  sourcePath: string,
  targetPath: string,
  options: CopyFileOptions = {},
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });

  if (options.signal?.aborted) {
    throw new Error('File copy cancelled');
  }

  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(sourcePath);
    const target = createWriteStream(targetPath);
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      source.destroy();
      target.destroy();
      reject(error);
    };

    const onAbort = (): void => {
      fail(new Error('File copy cancelled'));
    };

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort);
    };

    const settle = (callback: () => void): void => {
      cleanup();
      callback();
    };

    const failAndCleanup = (error: Error): void => {
      cleanup();
      fail(error);
    };

    source.once('error', failAndCleanup);
    target.once('error', failAndCleanup);
    target.once('close', () => {
      if (!settled) {
        settled = true;
        settle(resolve);
      }
    });

    options.signal?.addEventListener('abort', onAbort, { once: true });

    source.pipe(target);
  });
}

/** Copy an import candidate, decoding anemoi's XOR-wrapped OWP audio to OGG. */
export async function copyAudioFileStreaming(
  sourcePath: string,
  targetPath: string,
  options: CopyFileOptions = {},
): Promise<void> {
  if (path.extname(sourcePath).toLowerCase() !== '.owp') {
    await copyFileStreaming(sourcePath, targetPath, options);
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const source = await openDecodedOwpStream(sourcePath);
  const target = createWriteStream(targetPath);
  await pipeline(source, target, options.signal ? { signal: options.signal } : {});
}
