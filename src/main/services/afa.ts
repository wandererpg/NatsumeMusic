import { open } from 'node:fs/promises';
import { promisify } from 'node:util';
import { inflate } from 'node:zlib';
import { AppError } from '../../shared/errors';
import { isAudioFile } from './formats';
import { writeArchiveAudio } from './archive-audio';

const inflateIndex = promisify(inflate);
const MAX_INDEX_BYTES = 64 * 1024 * 1024;

interface AfaAudioEntry {
  name: string;
  offset: number;
  size: number;
}

function invalidArchive(): Error {
  return new AppError('EXTRACT_FAILED', 'Invalid AFA index', 'AFA 资源包目录损坏或超出支持范围');
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AppError('CANCELLED', 'AFA extraction cancelled', '导入已取消');
}

function nameDecoder(names: Buffer[]): TextDecoder {
  // Localized Alicesoft releases may use GBK instead of CP932. Choose one
  // encoding for the whole index so a trailing multibyte byte cannot eat '.'.
  for (const encoding of ['utf-8', 'shift_jis', 'gb18030']) {
    const decoder = new TextDecoder(encoding, { fatal: true });
    try {
      for (const name of names) decoder.decode(name);
      return decoder;
    } catch { /* Try the next known filename encoding. */ }
  }
  return new TextDecoder('shift_jis');
}

/** null means an AFA variant handled by the existing GARbro fallback. */
export async function readAfaAudioIndex(archivePath: string, signal?: AbortSignal): Promise<AfaAudioEntry[] | null> {
  checkAborted(signal);
  const handle = await open(archivePath, 'r');
  try {
    const header = Buffer.alloc(44);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 44 || header.toString('ascii', 0, 4) !== 'AFAH'
      || header.toString('ascii', 8, 16) !== 'AlicArch') return null;
    const version = header.readUInt32LE(16);
    if (version !== 1 && version !== 2) return null;
    if (header.toString('ascii', 28, 32) !== 'INFO') throw invalidArchive();
    const dataOffset = header.readUInt32LE(24);
    const packedSize = header.readUInt32LE(32) - 16;
    const indexSize = header.readUInt32LE(36);
    const count = header.readUInt32LE(40);
    const fileSize = (await handle.stat()).size;
    if (packedSize <= 0 || packedSize > MAX_INDEX_BYTES || indexSize > MAX_INDEX_BYTES
      || count > 250_000 || 44 + packedSize > dataOffset || dataOffset + 8 > fileSize) throw invalidArchive();
    const dataHeader = Buffer.alloc(8);
    if ((await handle.read(dataHeader, 0, 8, dataOffset)).bytesRead !== 8
      || dataHeader.toString('ascii', 0, 4) !== 'DATA') throw invalidArchive();
    const packed = Buffer.alloc(packedSize);
    if ((await handle.read(packed, 0, packed.length, 44)).bytesRead !== packed.length) throw invalidArchive();
    const index = await inflateIndex(packed, { maxOutputLength: MAX_INDEX_BYTES });
    checkAborted(signal);
    if (index.length !== indexSize) throw invalidArchive();
    const records: Array<{ rawName: Buffer; offset: number; size: number }> = [];
    let position = 0;
    const trailerSize = version === 1 ? 20 : 16;
    for (let i = 0; i < count; i += 1) {
      if (position + 8 > index.length) throw invalidArchive();
      const nameSize = index.readUInt32LE(position);
      const nameBlockSize = index.readUInt32LE(position + 4);
      position += 8;
      if (!nameSize || nameSize > nameBlockSize || position + nameBlockSize + trailerSize > index.length) throw invalidArchive();
      const rawName = index.subarray(position, position + nameSize);
      position += nameBlockSize;
      const offset = dataOffset + index.readUInt32LE(position + trailerSize - 8);
      const size = index.readUInt32LE(position + trailerSize - 4);
      position += trailerSize;
      if (offset < dataOffset + 8 || offset + size > fileSize) throw invalidArchive();
      records.push({ rawName, offset, size });
    }
    const decoder = nameDecoder(records.map(({ rawName }) => rawName));
    return records.flatMap(({ rawName, offset, size }) => {
      const name = decoder.decode(rawName).replace(/\0+$/, '');
      return isAudioFile(name) && size > 0 ? [{ name, offset, size }] : [];
    });
  } finally {
    await handle.close();
  }
}

/** Read only indexed audio ranges; never unpack large image or script assets. */
export async function extractAfaAudio(
  archivePath: string,
  outputDir: string,
  options: { signal?: AbortSignal; onOutput?: (text: string) => void } = {},
): Promise<boolean> {
  const entries = await readAfaAudioIndex(archivePath, options.signal);
  if (entries === null) return false;
  await writeArchiveAudio(archivePath, outputDir, entries, options);
  return true;
}
