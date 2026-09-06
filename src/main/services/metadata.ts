import { stat } from 'node:fs/promises';
import path from 'node:path';
import * as musicMetadata from 'music-metadata';

import { openDecodedOwpStream } from './owp';

export interface AudioMetadata {
  /** Embedded Vorbis/ID3 title, when the source file provides one. */
  title?: string | null;
  duration: number | null;
  format: string | null;
  fileSize: number;
}

// music-metadata's Node entry point exports parseFile at runtime.  Some
// package releases omit the Node-specific declaration file, so keep the
// narrow runtime contract local rather than weakening the rest of the app's
// TypeScript settings.
interface ParsedMetadata {
  common?: {
    title?: unknown;
  };
  format?: {
    duration?: unknown;
    container?: unknown;
  };
}

type ParseFile = (filePath: string) => Promise<ParsedMetadata>;
type ParseStream = (
  stream: NodeJS.ReadableStream,
  fileInfo?: { mimeType?: string; size?: number },
) => Promise<ParsedMetadata>;
interface MusicMetadataBridge {
  parseFile?: ParseFile;
  parseStream?: ParseStream;
  loadMusicMetadata?: () => Promise<{ parseFile: ParseFile; parseStream: ParseStream }>;
}

const metadataBridge = musicMetadata as unknown as MusicMetadataBridge;
let parseFilePromise: Promise<ParseFile> | undefined;
let parseStreamPromise: Promise<ParseStream> | undefined;

async function resolveParseFile(): Promise<ParseFile> {
  if (typeof metadataBridge.parseFile === 'function') return metadataBridge.parseFile;
  if (!parseFilePromise) {
    if (typeof metadataBridge.loadMusicMetadata !== 'function') {
      throw new Error('music-metadata does not expose a compatible parser');
    }
    parseFilePromise = metadataBridge.loadMusicMetadata().then((module) => module.parseFile);
  }
  return parseFilePromise;
}

async function resolveParseStream(): Promise<ParseStream> {
  if (typeof metadataBridge.parseStream === 'function') return metadataBridge.parseStream;
  if (!parseStreamPromise) {
    if (typeof metadataBridge.loadMusicMetadata !== 'function') {
      throw new Error('music-metadata does not expose a compatible stream parser');
    }
    parseStreamPromise = metadataBridge.loadMusicMetadata().then((module) => module.parseStream);
  }
  return parseStreamPromise;
}

function extensionFallback(filePath: string): string | null {
  const extension = path.extname(filePath).replace(/^\./, '').toLowerCase();
  return extension || null;
}

/**
 * Read duration/container information for an audio file.
 *
 * Metadata parsers cannot decode every game-specific or malformed audio file;
 * in that case we retain the reliable byte size and extension while leaving
 * duration unknown instead of failing the whole import.
 */
export async function readAudioMetadata(filePath: string): Promise<AudioMetadata> {
  const fileSize = (await stat(filePath)).size;
  const fallbackFormat = extensionFallback(filePath);

  try {
    const metadata = path.extname(filePath).toLowerCase() === '.owp'
      ? await (await resolveParseStream())(
        await openDecodedOwpStream(filePath),
        { mimeType: 'audio/ogg', size: fileSize },
      )
      : await (await resolveParseFile())(filePath);
    const duration = metadata.format?.duration;
    const parsedFormat = metadata.format?.container;
    const format = typeof parsedFormat === 'string' ? parsedFormat : fallbackFormat;
    const embeddedTitle = typeof metadata.common?.title === 'string'
      ? metadata.common.title.trim()
      : '';

    return {
      ...(embeddedTitle ? { title: embeddedTitle } : {}),
      duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : null,
      format,
      fileSize,
    };
  } catch {
    return {
      duration: null,
      format: fallbackFormat,
      fileSize,
    };
  }
}

// Descriptive aliases for callers that use the service as a generic metadata
// reader. Keeping one implementation avoids subtly different fallback rules.
export const getAudioMetadata = readAudioMetadata;
export const parseAudioMetadata = readAudioMetadata;
