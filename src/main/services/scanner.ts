import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { isAudioFile } from './formats';
import { hashFile } from './hash';
import { readAudioMetadata } from './metadata';
import { AppError } from '../../shared/errors';
import type { ScanError, ScanProgress } from '../../shared/types';

/** Options for discovering audio files in a source directory. */
export interface ScanOptions {
  sourcePath: string;
  deepScan: boolean;
  signal: AbortSignal;
  onProgress(progress: ScanProgress): void;
}

/** The metadata required by the importer for one source audio file. */
export interface AudioCandidate {
  sourcePath: string;
  fileName: string;
  title: string | null;
  format: string;
  fileSize: number;
  duration: number | null;
  fileHash: string;
}

interface WalkResult {
  files: string[];
  errors: ScanError[];
}

interface MetadataResult {
  title?: string | null;
  duration?: number | null;
  format?: string | null;
  fileSize?: number;
}

/**
 * Convert a filesystem failure into the stable error vocabulary used by the
 * rest of the main process.  A failed child entry is reported and skipped;
 * callers still get a hard error when the requested root itself is missing.
 */
function classifyFsError(error: unknown): 'FILE_NOT_FOUND' | 'PERMISSION_DENIED' {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'PERMISSION_DENIED';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cancelledError(): AppError {
  return new AppError('CANCELLED', 'Scan cancelled', '扫描已取消');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancelledError();
  }
}

function normalize(sourcePath: string): string {
  return path.normalize(path.resolve(sourcePath));
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function entryError(file: string, error: unknown): ScanError {
  return {
    file: normalize(file),
    message: errorMessage(error),
    code: classifyFsError(error),
  };
}

/**
 * Recursively collect regular files.  We intentionally keep this separate
 * from metadata/hash work so progress has a stable total before the first
 * candidate is processed.
 */
async function collectFiles(
  root: string,
  _deepScan: boolean,
  signal: AbortSignal,
  isRoot = true,
): Promise<WalkResult> {
  throwIfAborted(signal);

  let directoryEntries;
  try {
    directoryEntries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (signal.aborted) {
      throw cancelledError();
    }
    if (isRoot) {
      const code = classifyFsError(error);
      const userMessage = code === 'FILE_NOT_FOUND'
        ? '找不到要扫描的文件夹。'
        : '无法读取要扫描的文件夹，请检查权限。';
      throw new AppError(code, errorMessage(error), userMessage, { cause: error });
    }
    return { files: [], errors: [entryError(root, error)] };
  }

  const files: string[] = [];
  const errors: ScanError[] = [];
  directoryEntries.sort((left, right) => comparePaths(left.name, right.name));

  for (const entry of directoryEntries) {
    throwIfAborted(signal);
    const candidate = normalize(path.join(root, entry.name));

    if (entry.isDirectory()) {
      // Ordinary directory recursion is always performed.  `deepScan` is
      // consumed by the importer to decide whether archive containers should
      // be extracted; it must not hide audio files in nested folders.
      const nested = await collectFiles(candidate, _deepScan, signal, false);
      files.push(...nested.files);
      errors.push(...nested.errors);
      continue;
    }

    // Symlinks and special files are deliberately ignored.  Following a
    // symlink could escape the user-selected source tree or create cycles.
    if (entry.isFile()) {
      files.push(candidate);
    }
  }

  return { files, errors };
}

function reportError(options: ScanOptions, error: ScanError, total: number): void {
  options.onProgress({
    phase: 'scanning',
    current: 0,
    total,
    currentFile: error.file,
    error,
  });
}

function sidecarKey(filePath: string): string {
  return normalize(filePath).toLocaleLowerCase();
}

async function readSidecarTitles(files: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const sidecarPath of files) {
    const extension = path.extname(sidecarPath).toLowerCase();
    if (extension !== '.cue' && extension !== '.m3u' && extension !== '.m3u8') continue;
    let content: string;
    try {
      content = await readFile(sidecarPath, 'utf8');
    } catch {
      continue;
    }
    const directory = path.dirname(sidecarPath);
    if (extension === '.cue') {
      let currentFile: string | null = null;
      let insideTrack = false;
      for (const line of content.split(/\r?\n/)) {
        const fileMatch = line.match(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/i);
        if (fileMatch) {
          currentFile = fileMatch[1] ?? fileMatch[2];
          insideTrack = false;
          continue;
        }
        if (/^\s*TRACK\s+\d+\s+AUDIO/i.test(line)) {
          insideTrack = true;
          continue;
        }
        const titleMatch = line.match(/^\s*TITLE\s+(?:"([^"]+)"|(.+))\s*$/i);
        const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').trim();
        if (insideTrack && currentFile && title) {
          const key = sidecarKey(path.resolve(directory, currentFile));
          if (!titles.has(key)) titles.set(key, title);
        }
      }
      continue;
    }

    let pendingTitle: string | null = null;
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      const info = line.match(/^#EXTINF:[^,]*,(.+)$/i);
      if (info) {
        pendingTitle = info[1].trim();
      } else if (line && !line.startsWith('#')) {
        if (pendingTitle) titles.set(sidecarKey(path.resolve(directory, line)), pendingTitle);
        pendingTitle = null;
      }
    }
  }
  return titles;
}

/**
 * Scan a folder for supported audio files.
 *
 * The scanner only reads source files.  It never mutates the destination
 * library or SQLite; importing and persistence are owned by importer.ts.
 */
export async function scanFolder(options: ScanOptions): Promise<AudioCandidate[]> {
  const root = normalize(options.sourcePath);
  throwIfAborted(options.signal);

  let rootStats;
  try {
    rootStats = await stat(root);
  } catch (error) {
    const code = classifyFsError(error);
    const userMessage = code === 'FILE_NOT_FOUND'
      ? '找不到要扫描的路径。'
      : '无法读取要扫描的路径，请检查权限。';
    throw new AppError(code, errorMessage(error), userMessage, { cause: error });
  }

  let files: string[];
  let errors: ScanError[];
  if (rootStats.isFile()) {
    files = [root];
    errors = [];
  } else if (rootStats.isDirectory()) {
    const collected = await collectFiles(root, options.deepScan, options.signal);
    files = collected.files;
    errors = collected.errors;
  } else {
    files = [];
    errors = [];
  }

  const sidecarTitles = await readSidecarTitles(files);
  files = files
    .map(normalize)
    .filter((file, index, all) => all.indexOf(file) === index)
    .filter((file) => isAudioFile(file))
    .sort(comparePaths);

  // Entry errors are non-fatal.  Make them observable through the same
  // serializable progress channel used by workers while preserving the
  // candidate-only return type required by the importer.
  for (const error of errors) {
    throwIfAborted(options.signal);
    reportError(options, error, files.length);
  }

  const candidates: AudioCandidate[] = [];
  for (let index = 0; index < files.length; index += 1) {
    throwIfAborted(options.signal);
    const sourcePath = files[index];
    const fileName = path.basename(sourcePath);
    const total = files.length;
    const current = index + 1;

    // Emit before expensive metadata/hash work so a renderer can update its
    // progress immediately.  Check again afterward so a cancel from the
    // progress callback stops before opening the next source file.
    options.onProgress({
      phase: 'scanning',
      current,
      total,
      currentFile: sourcePath,
    });
    throwIfAborted(options.signal);

    let fileSize: number;
    try {
      fileSize = (await stat(sourcePath)).size;
    } catch (error) {
      if (options.signal.aborted) {
        throw cancelledError();
      }
      reportError(options, entryError(sourcePath, error), total);
      continue;
    }

    let metadata: MetadataResult = {};
    try {
      metadata = (await readAudioMetadata(sourcePath)) as MetadataResult;
    } catch {
      // Metadata parsing is best-effort.  Invalid or uncommon containers are
      // still importable as long as their bytes can be read and hashed.
      metadata = {};
    }
    throwIfAborted(options.signal);

    let fileHash: string;
    try {
      fileHash = await hashFile(sourcePath);
    } catch (error) {
      if (options.signal.aborted) {
        throw cancelledError();
      }
      reportError(options, entryError(sourcePath, error), total);
      continue;
    }

    const extension = path.extname(fileName).replace(/^\./, '').toLowerCase();
    const duration = typeof metadata.duration === 'number' && Number.isFinite(metadata.duration)
      ? metadata.duration
      : null;

    candidates.push({
      sourcePath,
      fileName,
      title: typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim()
        : sidecarTitles.get(sidecarKey(sourcePath)) ?? null,
      // Store the normalized file extension, not parser-specific container
      // labels such as "Ogg" or "MPEG"; the library schema and UI use the
      // extension consistently for filtering and display.
      format: extension,
      fileSize: typeof metadata.fileSize === 'number' && Number.isFinite(metadata.fileSize)
        ? metadata.fileSize
        : fileSize,
      duration,
      fileHash,
    });
  }

  return candidates;
}

export default scanFolder;
