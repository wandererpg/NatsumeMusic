import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { AppError } from '../../shared/errors';

const NWA_HEADER_SIZE = 40;

export interface NwaHeaderMetadata {
  channels: number;
  bitsPerSample: number;
  sampleRate: number;
  sampleCount: number;
  duration: number;
}

export interface NwaConversionOptions {
  bridgePath?: string;
  signal?: AbortSignal;
}

/** Parse the fixed header used by VisualArt's/RealLive NWA audio. */
export function parseNwaHeader(header: Uint8Array): NwaHeaderMetadata | null {
  if (header.byteLength < NWA_HEADER_SIZE) return null;

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const channels = view.getUint16(0, true);
  const bitsPerSample = view.getUint16(2, true);
  const sampleRate = view.getUint32(4, true);
  const compressionLevel = view.getInt32(8, true);
  const sampleCount = view.getUint32(28, true);

  if (
    (channels !== 1 && channels !== 2)
    || (bitsPerSample !== 8 && bitsPerSample !== 16)
    || sampleRate < 8_000
    || sampleRate > 384_000
    || compressionLevel < -1
    || compressionLevel > 5
    || sampleCount === 0
  ) {
    return null;
  }

  return {
    channels,
    bitsPerSample,
    sampleRate,
    sampleCount,
    duration: sampleCount / sampleRate / channels,
  };
}

export async function readNwaHeader(filePath: string): Promise<NwaHeaderMetadata | null> {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(NWA_HEADER_SIZE);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length ? parseNwaHeader(header) : null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function resolveBridgePath(): string {
  const candidates: string[] = [];
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  if (electronProcess.resourcesPath && !electronProcess.resourcesPath.includes(`${path.sep}node_modules${path.sep}`)) {
    candidates.push(path.join(electronProcess.resourcesPath, 'tools', 'garbro', 'GARbro.NwaBridge.exe'));
  }
  candidates.push(path.resolve(__dirname, '../../../resources/tools/garbro/GARbro.NwaBridge.exe'));
  candidates.push(path.resolve(process.cwd(), 'resources/tools/garbro/GARbro.NwaBridge.exe'));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];
}

function cancellationError(): AppError {
  return new AppError('CANCELLED', 'NWA conversion cancelled', 'NWA 音频转换已取消');
}

function conversionError(message: string, cause?: unknown): AppError {
  return new AppError(
    'EXTRACT_FAILED',
    message,
    '无法转换 NWA 音频。请检查 GARbro 资源是否完整。',
    cause instanceof Error ? { cause } : undefined,
  );
}

/** Convert a standalone NWA file to a standard WAV file using GARbro. */
export async function convertNwaToWav(
  sourcePath: string,
  targetPath: string,
  options: NwaConversionOptions = {},
): Promise<void> {
  if (options.signal?.aborted) throw cancellationError();

  const bridgePath = options.bridgePath ?? resolveBridgePath();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bridgePath, [sourcePath, targetPath], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let settled = false;

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = (): void => {
      child.kill();
      finish(() => reject(cancellationError()));
    };

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', (error) => finish(() => reject(conversionError(`Unable to start NWA bridge: ${error.message}`, error))));
    child.once('close', (code) => {
      if (code === 0) {
        finish(resolve);
        return;
      }
      const detail = stderr.trim() || `NWA bridge exited with code ${String(code)}`;
      finish(() => reject(conversionError(detail)));
    });
    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}
