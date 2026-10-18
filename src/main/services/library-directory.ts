import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';

import { AppError } from '../../shared/errors';
import { assertWithin } from '../../shared/paths';
import { createGame, findGameByName, listGames, setGameCover } from '../database/queries/games';
import { getSetting, setSetting } from '../database/queries/settings';
import { insertTrack, listTracks, updateTrackStorage } from '../database/queries/tracks';
import { scanFolder } from './scanner';

export const LIBRARY_INDEX_PATH = 'library_index_path';

export function isWithinLibrary(filePath: string, directory: string): boolean {
  try { assertWithin(filePath, directory); return true; } catch { return false; }
}

/** Read existing songs in place, then commit their index and settings together. */
export async function indexLibraryDirectory(db: Database.Database, directory: string, commitSettings: () => void = () => {}): Promise<void> {
  await mkdir(directory, { recursive: true });
  if (!(await stat(directory)).isDirectory()) throw new Error('请选择音乐所在的文件夹。');
  const errors: string[] = [];
  const candidates = await scanFolder({ sourcePath: directory, deepScan: false, signal: new AbortController().signal,
    onProgress: progress => { if (progress.error) errors.push(progress.error.message); },
  });
  if (errors.length) throw new AppError('PERMISSION_DENIED', errors[0], `无法完整读取音乐目录，请检查文件权限后重试：${errors[0]}`);
  const previousDirectory = getSetting(db, 'library_path') ?? '';
  db.transaction(() => {
    const tracks = listTracks(db);
    const byPath = new Map(tracks.map(track => [path.resolve(track.filePath).toLocaleLowerCase(), track]));
    const byHash = new Map<string, typeof tracks>();
    for (const track of tracks) byHash.set(track.fileHash, [...(byHash.get(track.fileHash) ?? []), track]);
    const claimed = new Set<string>();
    const seenHashes = new Set<string>();
    for (const candidate of candidates) {
      // NWA/OWP require conversion through the game's import workflow.
      if (candidate.format === 'nwa' || candidate.format === 'owp') continue;
      const matching = byHash.get(candidate.fileHash) ?? [];
      const samePath = byPath.get(path.resolve(candidate.sourcePath).toLocaleLowerCase());
      const existing = samePath
        ?? matching.find(track => !claimed.has(track.id) && (!isWithinLibrary(track.filePath, directory) || !existsSync(track.filePath)));
      if (existing) {
        updateTrackStorage(db, existing.id, { filePath: candidate.sourcePath, fileName: candidate.fileName, duration: candidate.duration ?? existing.duration, kind: existing.kind });
        db.prepare('UPDATE tracks SET file_hash = ?, file_size = ?, format = ? WHERE id = ?')
          .run(candidate.fileHash, candidate.fileSize, candidate.format, existing.id);
        claimed.add(existing.id); seenHashes.add(candidate.fileHash);
        continue;
      }
      if (seenHashes.has(candidate.fileHash)) continue;
      seenHashes.add(candidate.fileHash);
      const relative = path.relative(directory, candidate.sourcePath).split(path.sep);
      const categories = new Set(['音乐', '语音', 'music', 'voice']);
      const first = relative[0];
      const name = relative.length > 1 && !categories.has(first.toLocaleLowerCase()) ? first : path.basename(directory);
      const game = findGameByName(db, name) ?? createGame(db, { id: randomUUID(), name });
      const gameTracks = listTracks(db, game.id);
      insertTrack(db, { id: randomUUID(), gameId: game.id, filePath: candidate.sourcePath, fileName: candidate.fileName,
        customName: candidate.title, duration: candidate.duration, format: candidate.format, fileSize: candidate.fileSize, fileHash: candidate.fileHash,
        trackNumber: gameTracks.reduce((max, track) => Math.max(max, track.trackNumber), -1) + 1,
        kind: relative.slice(0, -1).some(part => ['语音', 'voice'].includes(part.toLocaleLowerCase())) ? 'voice' : 'music',
      });
    }
    // Covers move with a copied library; don't guess by filename in unrelated folders.
    if (previousDirectory && path.resolve(previousDirectory) !== path.resolve(directory)) {
      for (const game of listGames(db)) {
        if (game.coverPath && isWithinLibrary(game.coverPath, previousDirectory)) {
          const nextCover = path.join(directory, path.relative(previousDirectory, game.coverPath));
          if (existsSync(nextCover)) setGameCover(db, game.id, nextCover, game.coverSource);
        }
      }
    }
    commitSettings();
    setSetting(db, LIBRARY_INDEX_PATH, directory);
  })();
}
