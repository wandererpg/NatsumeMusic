import { open } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/errors';
import { isAudioFile } from './formats';
import { checkArchiveAborted, writeArchiveAudio, type ArchiveAudioEntry } from './archive-audio';

export interface BgiAudioEntry extends ArchiveAudioEntry {
  duration: number | null;
}

function invalidArchive(): Error {
  return new AppError('EXTRACT_FAILED', 'Invalid BGI archive or BW audio header', 'BGI 资源包目录或音频头损坏');
}

/** null preserves GARbro handling for the many unrelated formats named .arc. */
export async function readBgiAudioIndex(archivePath: string, signal?: AbortSignal): Promise<BgiAudioEntry[] | null> {
  checkArchiveAborted(signal);
  const handle = await open(archivePath, 'r');
  try {
    const header = Buffer.alloc(16);
    if ((await handle.read(header, 0, 16, 0)).bytesRead !== 16) return null;
    const signature = header.toString('ascii', 0, 12);
    const legacy = signature === 'PackFile    ';
    if (signature !== 'BURIKO ARC20' && !legacy) return null;
    const count = header.readUInt32LE(12);
    const recordSize = legacy ? 32 : 128;
    const nameSize = legacy ? 16 : 96;
    const baseOffset = 16 + count * recordSize;
    const fileSize = (await handle.stat()).size;
    if (count > 250_000 || baseOffset > fileSize) throw invalidArchive();
    const index = Buffer.alloc(count * recordSize);
    if ((await handle.read(index, 0, index.length, 16)).bytesRead !== index.length) throw invalidArchive();
    const entries: BgiAudioEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      checkArchiveAborted(signal);
      const record = i * recordSize;
      const offset = baseOffset + index.readUInt32LE(record + nameSize);
      const size = index.readUInt32LE(record + nameSize + 4);
      if (offset + size > fileSize) throw invalidArchive();
      if (size < 4) continue;
      const rawName = index.subarray(record, record + nameSize);
      const nul = rawName.indexOf(0);
      const nameBytes = rawName.subarray(0, nul < 0 ? rawName.length : nul);
      let name: string;
      try { name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes); }
      catch { name = new TextDecoder('shift_jis').decode(nameBytes); }
      if (!name) throw invalidArchive();
      const audioHeader = Buffer.alloc(Math.min(size, 64));
      if ((await handle.read(audioHeader, 0, audioHeader.length, offset)).bytesRead !== audioHeader.length) throw invalidArchive();
      const bw = audioHeader.length >= 8 && audioHeader.toString('ascii', 4, 8) === 'bw  ';
      let audioOffset = offset;
      let audioSize = size;
      let extension: string | null = null;
      let duration: number | null = null;
      if (bw) {
        const headerSize = audioHeader.readUInt32LE(0);
        if (headerSize < 8 || headerSize + 4 > size) throw invalidArchive();
        audioOffset += headerSize;
        audioSize -= headerSize;
        const magic = Buffer.alloc(4);
        if ((await handle.read(magic, 0, 4, audioOffset)).bytesRead !== 4 || magic.toString('ascii') !== 'OggS') throw invalidArchive();
        extension = '.ogg';
        if (headerSize >= 24 && audioHeader.length >= 24) {
          const samples = audioHeader.readUInt32LE(12);
          const rate = audioHeader.readUInt32LE(16);
          if (samples > 0 && rate >= 8000 && rate <= 384000) duration = samples / rate;
        }
      } else {
        const magic = audioHeader.toString('ascii', 0, 4);
        if (magic === 'OggS') extension = '.ogg';
        else if (magic === 'fLaC') extension = '.flac';
        else if (magic === 'RIFF' && audioHeader.toString('ascii', 8, 12) === 'WAVE') extension = '.wav';
        else if (isAudioFile(name)) extension = path.extname(name);
      }
      if (extension) {
        const currentExtension = path.extname(name);
        const stem = currentExtension ? name.slice(0, -currentExtension.length) : name;
        entries.push({ name: `${stem}${extension}`, offset: audioOffset, size: audioSize, duration });
      }
    }
    return entries;
  } finally {
    await handle.close();
  }
}

export async function extractBgiAudio(
  archivePath: string,
  outputDir: string,
  options: { signal?: AbortSignal; onOutput?: (text: string) => void; minimumAudioDurationSeconds?: number } = {},
): Promise<boolean> {
  const entries = await readBgiAudioIndex(archivePath, options.signal);
  if (entries === null) return false;
  const minimum = options.minimumAudioDurationSeconds;
  const selected = minimum === undefined ? entries : entries.filter((entry) => entry.duration === null || entry.duration > minimum);
  await writeArchiveAudio(archivePath, outputDir, selected, options);
  return true;
}
