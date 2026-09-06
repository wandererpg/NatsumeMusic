import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type Database from 'better-sqlite3';

import { createGame, findGameByName, type GameInput } from '../database/queries/games';
import { findTrackByHash, insertTrack, listTracks, updateTrackMetadata, updateTrackStorage, type TrackInput } from '../database/queries/tracks';
import { AppError, isAppError, type ErrorCode } from '../../shared/errors';
import { assertWithin, sanitizeDirectoryName } from '../../shared/paths';
import type { ScanError, ScanProgress, ScanResult } from '../../shared/types';
import { copyAudioFileStreaming } from './file-copy';
import { inspectSm2MpxArchive, isArchiveFile } from './formats';
import { disposeTempDir, extractArchive } from './extractor';
import { scanFolder, type AudioCandidate } from './scanner';
import { categoryDirectory } from './library-layout';
import { classifyTrack } from './track-classification';
import type { GameMetadataService } from './game-metadata';

type SQLiteDatabase = Database.Database;

/** Options accepted by an injected archive extractor. */
export interface ExtractorOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
}

/**
 * Minimal extractor contract used by the importer.  Keeping this contract
 * small makes archive extraction deterministic in tests while the production
 * implementation delegates to the GARbro/RPA service.
 */
export interface ExtractorService {
  extractArchive(archivePath: string, options?: ExtractorOptions): Promise<string>;
  disposeTempDir(tempDir?: string): Promise<void>;
}

export type ExtractorLike = ExtractorService | ((archivePath: string, options?: ExtractorOptions) => Promise<string>);

/** Import request and dependency-injection seam for the main process/tests. */
export interface ImportOptions {
  sourcePath: string;
  libraryPath: string;
  gameName: string;
  deepScan: boolean;
  includeVoice: boolean;
  voiceThresholdSeconds: number;
  signal: AbortSignal;
  onProgress(progress: ScanProgress): void;
  /** SQLite connection used for game/track persistence. */
  db?: SQLiteDatabase;
  /** Alias accepted by callers that name the connection `database`. */
  database?: SQLiteDatabase;
  /** Archive implementation; production defaults to the extractor service. */
  extractor?: ExtractorLike;
  /** Optional game-level metadata enrichment; omitted for offline embedders/tests. */
  metadata?: GameMetadataService;
}

interface ArchiveWalkResult {
  files: string[];
  errors: ScanError[];
}

let configuredDatabase: SQLiteDatabase | undefined;

/** Configure a default connection for callers that keep the database at app scope. */
export function setImporterDatabase(db: SQLiteDatabase | undefined): void {
  configuredDatabase = db;
}

function normalize(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown, fallback: ErrorCode = 'DB_ERROR'): ErrorCode {
  return isAppError(error) ? error.code : fallback;
}

function cancelledError(): AppError {
  return new AppError('CANCELLED', 'Import cancelled', '导入已取消');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancelledError();
  }
}

function scanError(file: string, error: unknown, fallback: ErrorCode = 'DB_ERROR'): ScanError {
  return {
    file: normalize(file),
    message: errorMessage(error),
    code: errorCode(error, fallback),
  };
}

function classifyFsError(error: unknown): ErrorCode {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'PERMISSION_DENIED';
}

function archiveEntryError(file: string, error: unknown): ScanError {
  return scanError(file, error, classifyFsError(error));
}

async function isImportableArchive(filePath: string, includeVoice: boolean): Promise<boolean> {
  if (isArchiveFile(filePath)) return true;
  // SM2MPX containers are extensionless. Avoid opening ordinary files with
  // extensions while walking large game installations.
  if (path.extname(filePath)) return false;
  const kind = await inspectSm2MpxArchive(filePath);
  return kind === 'music' || kind === 'voice' && includeVoice;
}

async function walkArchives(rootInput: string, includeVoice: boolean): Promise<ArchiveWalkResult> {
  const root = normalize(rootInput);
  let rootStats;
  try {
    rootStats = await stat(root);
  } catch (error) {
    return { files: [], errors: [archiveEntryError(root, error)] };
  }

  if (rootStats.isFile()) {
    return await isImportableArchive(root, includeVoice)
      ? { files: [root], errors: [] }
      : { files: [], errors: [] };
  }
  if (!rootStats.isDirectory()) {
    return { files: [], errors: [] };
  }

  const files: string[] = [];
  const errors: ScanError[] = [];

  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      errors.push(archiveEntryError(directory, error));
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    for (const entry of entries) {
      const entryPath = normalize(path.join(directory, entry.name));
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && await isImportableArchive(entryPath, includeVoice)) {
        files.push(entryPath);
      }
    }
  };

  await visit(root);
  return { files, errors };
}

function defaultExtractor(): ExtractorService {
  return { extractArchive, disposeTempDir };
}

function resolveExtractor(input: ExtractorLike | undefined): ExtractorService {
  if (!input) {
    return defaultExtractor();
  }
  if (typeof input === 'function') {
    return {
      extractArchive: input,
      disposeTempDir: async () => undefined,
    };
  }
  return input;
}

async function disposeExtractedDir(
  extractor: ExtractorService,
  tempDir: string | undefined,
): Promise<void> {
  if (!tempDir) {
    return;
  }
  await extractor.disposeTempDir(tempDir);
}

function gameDirectory(libraryPathInput: string, gameName: string): string {
  const libraryPath = normalize(libraryPathInput);
  if (!gameName.trim()) {
    throw new AppError('DB_ERROR', 'Game name cannot be empty', '请输入游戏名称');
  }

  // Keep the original game name for the database/UI, but use a filesystem-safe
  // component for the copied audio directory on Windows.
  const candidate = path.join(libraryPath, sanitizeDirectoryName(gameName));
  return assertWithin(candidate, libraryPath);
}

async function collectUsedNames(directory: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    for (const name of await readdir(directory)) {
      names.add(name.toLocaleLowerCase());
    }
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code !== 'ENOENT') {
      throw error;
    }
  }
  return names;
}

/**
 * Pick a destination filename without replacing an existing file.  Windows
 * treats filenames case-insensitively, so the in-memory collision set does as
 * well even when tests run on another platform.
 */
async function allocateTarget(
  directory: string,
  sourceName: string,
  usedNames: Set<string>,
): Promise<{ fileName: string; filePath: string }> {
  const original = path.basename(sourceName);
  const fallback = original || 'track.audio';
  const extension = path.extname(fallback);
  const stem = extension ? fallback.slice(0, -extension.length) : fallback;

  for (let suffix = 0; ; suffix += 1) {
    const fileName = suffix === 0 ? fallback : `${stem} (${suffix})${extension}`;
    const key = fileName.toLocaleLowerCase();
    const filePath = path.join(directory, fileName);
    if (usedNames.has(key)) {
      continue;
    }

    try {
      await access(filePath);
      usedNames.add(key);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code !== 'ENOENT') {
        throw error;
      }
      usedNames.add(key);
      return { fileName, filePath };
    }
  }
}

function importedFileName(candidate: AudioCandidate): string {
  return path.extname(candidate.fileName).toLowerCase() === '.owp'
    ? `${path.basename(candidate.fileName, path.extname(candidate.fileName))}.ogg`
    : candidate.fileName;
}

async function scanCandidates(
  sourcePath: string,
  deepScan: boolean,
  options: ImportOptions,
  errors: ScanError[],
): Promise<AudioCandidate[]> {
  return scanFolder({
    sourcePath,
    deepScan,
    signal: options.signal,
    onProgress: (progress) => {
      if (progress.error) {
        errors.push(progress.error);
      }
      options.onProgress(progress);
    },
  });
}

function resolveDatabase(options: ImportOptions): SQLiteDatabase {
  const db = options.db ?? options.database ?? configuredDatabase;
  if (!db) {
    throw new AppError('DB_ERROR', 'Importer requires a SQLite database connection', '无法打开音乐库数据库');
  }
  return db;
}

function createOrGetGame(db: SQLiteDatabase, name: string): ReturnType<typeof findGameByName> {
  const existing = findGameByName(db, name);
  if (existing) {
    return existing;
  }

  const input: GameInput = { id: randomUUID(), name };
  const create = db.transaction(() => createGame(db, input));
  return create();
}

function appendProgress(options: ImportOptions, progress: ScanProgress): void {
  options.onProgress(progress);
}

/**
 * Import ordinary audio and (when enabled) audio discovered inside archives.
 * Filesystem copies intentionally happen before each small SQLite transaction;
 * this preserves prior successful rows if a later candidate fails.
 */
export async function importGameFolder(options: ImportOptions): Promise<ScanResult> {
  const db = resolveDatabase(options);
  const targetDirectory = gameDirectory(options.libraryPath, options.gameName);
  await mkdir(targetDirectory, { recursive: true });
  throwIfAborted(options.signal);

  const errors: ScanError[] = [];
  const extractedDirectories: string[] = [];
  let completedResult: ScanResult | undefined;

  try {
  const ordinaryCandidates = await scanCandidates(options.sourcePath, options.deepScan, options, errors);
  let candidates = [...ordinaryCandidates];
  let extracted = 0;
  const extractor = resolveExtractor(options.extractor);

  if (options.deepScan) {
    const archives = await walkArchives(options.sourcePath, options.includeVoice);
    errors.push(...archives.errors);

    for (let archiveIndex = 0; archiveIndex < archives.files.length; archiveIndex += 1) {
      throwIfAborted(options.signal);
      const archivePath = archives.files[archiveIndex];
      let tempDirectory: string | undefined;

      try {
        appendProgress(options, {
          phase: 'extracting',
          current: archiveIndex + 1,
          total: archives.files.length,
          currentFile: archivePath,
        });

        tempDirectory = await extractor.extractArchive(archivePath, {
          signal: options.signal,
          onProgress: (progress) => {
            // Normalize injected extractor progress to the importer-wide
            // archive total while preserving optional diagnostic fields.
            options.onProgress({
              ...progress,
              phase: 'extracting',
              current: archiveIndex + 1,
              total: archives.files.length,
              currentFile: archivePath,
            });
          },
        });
        extractedDirectories.push(tempDirectory);
        throwIfAborted(options.signal);
        extracted += 1;

        const archiveCandidates = await scanCandidates(tempDirectory, false, options, errors);
        candidates = candidates.concat(archiveCandidates);
      } catch (error) {
        if (isAppError(error) && error.code === 'CANCELLED' || options.signal.aborted) {
          throw error;
        }
        errors.push(scanError(archivePath, error, 'EXTRACT_FAILED'));
      }
    }
  }

  const game = createOrGetGame(db, options.gameName);
  if (!game) {
    throw new AppError('DB_ERROR', 'Unable to create imported game', '无法创建游戏记录');
  }

  const usedNamesByKind = new Map<string, Set<string>>();
  const existingTracks = listTracks(db, game.id);
  let nextTrackNumber = existingTracks.reduce((max, track) => Math.max(max, track.trackNumber), -1) + 1;
  let copied = 0;
  let skipped = 0;
  const seenHashes = new Set<string>();

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    throwIfAborted(options.signal);
    const kind = classifyTrack(candidate.duration, options.voiceThresholdSeconds);

    // Hash checks happen before any destination mutation.  This covers both
    // tracks already in SQLite and duplicate candidates in this same import.
    const existingByHash = findTrackByHash(db, candidate.fileHash);
    if (seenHashes.has(candidate.fileHash) || existingByHash) {
      // Re-importing is also a metadata refresh: an older import may have
      // happened before a CUE/M3U file or embedded title became available.
      if (existingByHash && (!existingByHash.customName && candidate.title || existingByHash.duration === null && candidate.duration !== null)) {
        const nextDuration = existingByHash.duration ?? candidate.duration;
        const nextKind = classifyTrack(nextDuration, options.voiceThresholdSeconds);
        let nextPath = existingByHash.filePath;
        let nextFileName = existingByHash.fileName;
        let moved = false;
        if (nextKind !== existingByHash.kind) {
          const destinationDirectory = categoryDirectory(targetDirectory, nextKind);
          await mkdir(destinationDirectory, { recursive: true });
          let names = usedNamesByKind.get(nextKind);
          if (!names) {
            names = await collectUsedNames(destinationDirectory);
            usedNamesByKind.set(nextKind, names);
          }
          const target = await allocateTarget(destinationDirectory, existingByHash.fileName, names);
          await rename(existingByHash.filePath, target.filePath);
          nextPath = target.filePath;
          nextFileName = target.fileName;
          moved = true;
        }
        try {
          db.transaction(() => {
            updateTrackStorage(db, existingByHash.id, {
              filePath: nextPath,
              fileName: nextFileName,
              duration: nextDuration,
              kind: nextKind,
            });
            if (!existingByHash.customName && candidate.title) {
              updateTrackMetadata(db, existingByHash.id, { customName: candidate.title });
            }
          })();
        } catch (error) {
          if (moved) await rename(nextPath, existingByHash.filePath).catch(() => undefined);
          throw error;
        }
      }
      skipped += 1;
      seenHashes.add(candidate.fileHash);
      continue;
    }
    if (kind === 'voice' && !options.includeVoice) {
      skipped += 1;
      seenHashes.add(candidate.fileHash);
      continue;
    }
    seenHashes.add(candidate.fileHash);

    appendProgress(options, {
      phase: 'copying',
      current: index + 1,
      total: candidates.length,
      currentFile: candidate.sourcePath,
    });

    let target: { fileName: string; filePath: string } | undefined;
    try {
      throwIfAborted(options.signal);
      const destinationDirectory = categoryDirectory(targetDirectory, kind);
      await mkdir(destinationDirectory, { recursive: true });
      let usedNames = usedNamesByKind.get(kind);
      if (!usedNames) {
        usedNames = await collectUsedNames(destinationDirectory);
        usedNamesByKind.set(kind, usedNames);
      }
      target = await allocateTarget(destinationDirectory, importedFileName(candidate), usedNames);
      await copyAudioFileStreaming(candidate.sourcePath, target.filePath, { signal: options.signal });
      throwIfAborted(options.signal);

      const input: TrackInput = {
        id: randomUUID(),
        gameId: game.id,
        filePath: target.filePath,
        fileName: target.fileName,
        // Prefer a formal embedded title for display.  The copied file name
        // remains untouched and is still shown as the source name in the UI.
        customName: candidate.title ?? null,
        duration: candidate.duration,
        format: path.extname(target.fileName).replace(/^\./, '').toLowerCase() || candidate.format,
        fileSize: candidate.fileSize,
        fileHash: candidate.fileHash,
        trackNumber: nextTrackNumber,
        kind,
      };
      const insert = db.transaction(() => insertTrack(db, input));
      insert();
      nextTrackNumber += 1;
      copied += 1;
    } catch (error) {
      if (isAppError(error) && error.code === 'CANCELLED' || options.signal.aborted) {
        if (target) {
          await rm(target.filePath, { force: true }).catch(() => undefined);
        }
        throw error;
      }
      if (target) {
        await rm(target.filePath, { force: true }).catch(() => undefined);
      }
      errors.push(scanError(candidate.sourcePath, error));
    }
  }

  completedResult = {
    found: candidates.length,
    extracted,
    copied,
    skipped,
    errors,
  };

  if (options.metadata) {
    try {
      throwIfAborted(options.signal);
      completedResult.metadata = await options.metadata.ensure(game.id, {
        signal: options.signal,
        onProgress: (progress) => appendProgress(options, {
          ...progress,
          currentFile: options.gameName,
        }),
      });
      throwIfAborted(options.signal);
    } catch (error) {
      if (options.signal.aborted || isAppError(error) && error.code === 'CANCELLED') {
        throw cancelledError();
      }
      // Keep the persisted source-local failure visible on the completion
      // screen even when an outer metadata error prevented ensure() from
      // returning its final summary.
      try {
        completedResult.metadata = options.metadata.getSummary(game.id);
      } catch {
        // The audio import remains successful even if the diagnostic summary
        // cannot be read after a metadata failure.
      }
      // Metadata is intentionally non-fatal. The metadata service persists
      // source-local failures so a later refresh can retry without losing
      // successfully copied audio rows.
    }
  }

  return completedResult;
  } finally {
    // Archive candidates keep their source bytes in the temporary extraction
    // directory until after the copy/SQLite phase.  Disposal here guarantees
    // cancellation and later-candidate failures cannot leak those dirs.
    const extractor = resolveExtractor(options.extractor);
    for (const tempDirectory of extractedDirectories) {
      try {
        await disposeExtractedDir(extractor, tempDirectory);
      } catch (error) {
        const cleanupError = scanError(tempDirectory, error, 'DB_ERROR');
        if (completedResult) {
          completedResult.errors.push(cleanupError);
        } else {
          errors.push(cleanupError);
        }
      }
    }
  }
}

export default importGameFolder;
