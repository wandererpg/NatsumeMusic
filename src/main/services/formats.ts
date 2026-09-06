import { open } from 'node:fs/promises';
import path from 'node:path';

export type Sm2MpxArchiveKind = 'music' | 'voice' | 'other';

const SM2MPX_SIGNATURE = 'SM2MPX10';

/** Audio containers commonly found in galgame installations. */
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ogg',
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.aac',
  '.opus',
  '.wma',
  '.owp',
]);

/** Archive formats supported by the deep scanner/extractor pipeline. */
export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.xp3',
  '.rpa',
  '.arc',
  '.pak',
]);

/**
 * Return a normalized extension for either a file path or an extension.
 * Accepting a bare extension keeps the helpers convenient for callers that
 * already read a directory entry's extension.
 */
function normalizedExtension(filePathOrExtension: string): string {
  const value = filePathOrExtension.trim().toLowerCase();
  if (!value) {
    return '';
  }

  const extension = path.extname(value);
  if (extension) {
    return extension;
  }

  return value.startsWith('.') ? value : `.${value}`;
}

/** Return true when a path (or extension) identifies a supported audio file. */
export function isAudioFile(filePathOrExtension: string): boolean {
  return AUDIO_EXTENSIONS.has(normalizedExtension(filePathOrExtension));
}

/** Return true when a path (or extension) identifies a supported archive. */
export function isArchiveFile(filePathOrExtension: string): boolean {
  return ARCHIVE_EXTENSIONS.has(normalizedExtension(filePathOrExtension));
}

/**
 * Inspect the header used by Studio Miris SM2MPX resource containers.
 * These archives normally have no extension, so extension-based discovery
 * cannot find them. WMSC stores music, VOICE* stores dialogue, and the other
 * containers (SE/DATA/GGD...) are intentionally classified separately.
 */
export async function inspectSm2MpxArchive(filePath: string): Promise<Sm2MpxArchiveKind | null> {
  let handle;
  try {
    handle = await open(filePath, 'r');
    const header = Buffer.alloc(32);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 28 || header.toString('ascii', 0, 8) !== SM2MPX_SIGNATURE) {
      return null;
    }

    const containerName = header.toString('ascii', 16, 28).split('\0', 1)[0].trim().toUpperCase();
    if (containerName === 'WMSC') return 'music';
    if (containerName.startsWith('VOICE')) return 'voice';
    return 'other';
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
