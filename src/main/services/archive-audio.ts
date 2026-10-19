import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../shared/errors';

export interface ArchiveAudioEntry {
  name: string;
  offset: number;
  size: number;
}

export function checkArchiveAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError('CANCELLED', 'Audio extraction cancelled', '导入已取消');
}

/** Copy verified audio ranges into an owned temp directory, preserving names safely. */
export async function writeArchiveAudio(
  archivePath: string,
  outputDir: string,
  entries: ArchiveAudioEntry[],
  options: { signal?: AbortSignal; onOutput?: (text: string) => void } = {},
): Promise<void> {
  const usedNames = new Set<string>();
  for (const entry of entries) {
    checkArchiveAborted(options.signal);
    const relativeName = entry.name.replace(/\\/g, '/');
    const parts = relativeName.split('/');
    if (path.posix.isAbsolute(relativeName) || parts.some((part) => part === '..' || part.includes(':') || part.includes('\0'))) {
      throw new AppError('EXTRACT_FAILED', 'Unsafe archive audio path', '资源包包含不安全的音频路径');
    }
    const safeName = parts.filter((part) => part && part !== '.')
      .map((part) => {
        const safe = part.replace(/[<>"|?*\x00-\x1f]/g, '_').replace(/[ .]+$/, '') || '_';
        return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
      }).join(path.sep);
    let target = path.join(outputDir, safeName);
    const extension = path.extname(target);
    const stem = target.slice(0, -extension.length);
    let suffix = 2;
    while (usedNames.has(target.toLowerCase())) target = `${stem}-${suffix++}${extension}`;
    usedNames.add(target.toLowerCase());
    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(
      createReadStream(archivePath, { start: entry.offset, end: entry.offset + entry.size - 1 }),
      createWriteStream(target, { flags: 'wx' }),
      { signal: options.signal },
    ).catch((error: unknown) => {
      checkArchiveAborted(options.signal);
      throw error;
    });
    options.onOutput?.(`Extracted ${entry.name}`);
  }
}
