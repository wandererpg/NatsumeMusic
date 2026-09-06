import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { assertWithin } from '../../shared/paths';
import { AUDIO_PROTOCOL_SCHEME, parseAudioUrl } from '../../shared/audio-url';
import { isAudioFile } from './formats';

export interface AudioProtocolRequest {
  url: string;
  headers?: { get(name: string): string | null };
}

export interface AudioProtocolRegistrar {
  handle(
    scheme: string,
    handler: (request: AudioProtocolRequest) => Response | Promise<Response>,
  ): void;
}

export interface AudioProtocolOptions {
  protocol: AudioProtocolRegistrar;
  fetchFile(fileUrl: string): Promise<Response>;
  getLibraryPath(): string | Promise<string>;
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.ogg': return 'audio/ogg';
    case '.opus': return 'audio/ogg';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.flac': return 'audio/flac';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.wma': return 'audio/x-ms-wma';
    default: return 'application/octet-stream';
  }
}

function parseByteRange(value: string, size: number): { start: number; end: number } | null {
  const match = value.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || size <= 0) return null;
  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function streamResponse(filePath: string, start: number, end: number, size: number): Response {
  const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 206,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType(filePath),
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  });
}

/**
 * Register a renderer-safe audio stream. The renderer never receives direct
 * filesystem access; the main process only forwards files inside the library.
 */
export function registerAudioProtocol({ protocol, fetchFile, getLibraryPath }: AudioProtocolOptions): void {
  protocol.handle(AUDIO_PROTOCOL_SCHEME, async (request) => {
    const filePath = parseAudioUrl(request.url);
    if (!filePath || !path.isAbsolute(filePath) || !isAudioFile(filePath)) {
      return errorResponse(400, 'Invalid audio path');
    }

    const libraryPath = await getLibraryPath();
    if (!libraryPath.trim()) {
      return errorResponse(403, 'Audio library is not configured');
    }

    try {
      assertWithin(filePath, libraryPath);
    } catch {
      return errorResponse(403, 'Audio path is outside the library');
    }

    try {
      const rangeHeader = request.headers?.get('range');
      if (rangeHeader) {
        const fileSize = (await stat(filePath)).size;
        const range = parseByteRange(rangeHeader, fileSize);
        if (!range) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes' },
          });
        }
        return streamResponse(filePath, range.start, range.end, fileSize);
      }
      return await fetchFile(pathToFileURL(filePath).toString());
    } catch {
      return errorResponse(404, 'Audio file is unavailable');
    }
  });
}

export default registerAudioProtocol;
