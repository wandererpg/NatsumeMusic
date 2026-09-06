import { appendFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

import type Database from 'better-sqlite3';

import { listTracks, updateTrackStorage } from '../database/queries/tracks';
import { allocateTrackTarget, categoryDirectory, collectUsedNames, gameDirectory } from './library-layout';
import { readAudioMetadata, type AudioMetadata } from './metadata';
import { classifyTrack } from './track-classification';

type SQLiteDatabase = Database.Database;

export interface LayoutMigrationResult {
  inspected: number;
  moved: number;
  updated: number;
  errors: Array<{ trackId: string; filePath: string; message: string }>;
}

export interface LayoutMigrationOptions {
  readMetadata?: (filePath: string) => Promise<AudioMetadata>;
  moveFile?: typeof rename;
  appendLog?: (line: string) => Promise<void>;
  logPath?: string;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLocaleLowerCase() === path.resolve(right).toLocaleLowerCase();
}

export async function migrateLibraryLayout(
  db: SQLiteDatabase,
  libraryPath: string,
  options: LayoutMigrationOptions = {},
): Promise<LayoutMigrationResult> {
  const readMetadata = options.readMetadata ?? readAudioMetadata;
  const moveFile = options.moveFile ?? rename;
  const appendLog = options.appendLog ?? (options.logPath
    ? async (line: string) => {
      await mkdir(path.dirname(options.logPath!), { recursive: true });
      await appendFile(options.logPath!, `${line}\n`, 'utf8');
    }
    : undefined);
  const result: LayoutMigrationResult = { inspected: 0, moved: 0, updated: 0, errors: [] };
  const usedNames = new Map<string, Set<string>>();

  for (const track of listTracks(db, null)) {
    result.inspected += 1;
    let intendedPath = track.filePath;
    try {
      const currentGameDirectory = gameDirectory(libraryPath, track.gameName ?? '');
      const currentDirectory = path.dirname(track.filePath);
      const isAlreadyCategorized = samePath(currentDirectory, categoryDirectory(currentGameDirectory, 'music'))
        || samePath(currentDirectory, categoryDirectory(currentGameDirectory, 'voice'));
      if (isAlreadyCategorized) continue;

      let duration = track.duration;
      if (duration === null) {
        const metadata = await readMetadata(track.filePath);
        duration = typeof metadata.duration === 'number' && Number.isFinite(metadata.duration)
          ? metadata.duration
          : null;
      }
      const kind = classifyTrack(duration);
      const destination = categoryDirectory(currentGameDirectory, kind);
      await mkdir(destination, { recursive: true });
      const directTarget = path.join(destination, track.fileName);
      let target = { fileName: track.fileName, filePath: directTarget };
      let moved = false;

      if (!samePath(track.filePath, directTarget)) {
        let names = usedNames.get(destination);
        if (!names) {
          names = await collectUsedNames(destination);
          usedNames.set(destination, names);
        }
        target = await allocateTrackTarget(destination, track.fileName, names);
        intendedPath = target.filePath;
        await moveFile(track.filePath, target.filePath);
        moved = true;
      }

      try {
        updateTrackStorage(db, track.id, {
          filePath: target.filePath,
          fileName: target.fileName,
          duration,
          kind,
        });
      } catch (error) {
        if (moved) await moveFile(target.filePath, track.filePath).catch(() => undefined);
        throw error;
      }
      if (moved) result.moved += 1;
      result.updated += 1;
    } catch (error) {
      const entry = {
        trackId: track.id,
        filePath: track.filePath,
        message: error instanceof Error ? error.message : String(error),
      };
      result.errors.push(entry);
      if (appendLog) {
        await appendLog(JSON.stringify({
          timestamp: new Date().toISOString(),
          ...entry,
          intendedPath,
        })).catch(() => undefined);
      }
    }
  }
  return result;
}
