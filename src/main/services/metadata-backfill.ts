import type Database from 'better-sqlite3';

import { listGames } from '../database/queries/games';
import { listTracks, updateTrackMetadata } from '../database/queries/tracks';
import type { GameMetadataService } from './game-metadata';
import { readAudioMetadata, type AudioMetadata } from './metadata';

type SQLiteDatabase = Database.Database;
export type MetadataReader = (filePath: string) => Promise<AudioMetadata>;

/** Query legacy game rows in the background so metadata is not limited to new imports. */
export async function backfillMissingGameMetadata(
  db: SQLiteDatabase,
  metadata: Pick<GameMetadataService, 'ensure'>,
  signal: AbortSignal = new AbortController().signal,
): Promise<void> {
  for (const game of listGames(db)) {
    if (signal.aborted) return;
    try {
      await metadata.ensure(game.id, { signal });
    } catch {
      // A single offline source must not prevent the remaining games from being checked.
    }
  }
}

/** Backfill legacy rows that predate duration/title metadata indexing. */
export async function backfillMissingTrackMetadata(
  db: SQLiteDatabase,
  reader: MetadataReader = readAudioMetadata,
): Promise<void> {
  const legacyTracks = listTracks(db, null).filter((track) => track.duration === null);
  for (const track of legacyTracks) {
    try {
      const metadata = await reader(track.filePath);
      const duration = typeof metadata.duration === 'number' && Number.isFinite(metadata.duration) && metadata.duration > 0
        ? metadata.duration
        : null;
      const detectedTitle = !track.customName && typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim()
        : undefined;
      if (duration !== null || detectedTitle) {
        updateTrackMetadata(db, track.id, {
          ...(duration !== null ? { duration } : {}),
          ...(detectedTitle ? { customName: detectedTitle } : {}),
        });
      }
    } catch {
      // Missing or malformed legacy files remain playable/importable and can
      // be retried on a later launch.
    }
  }
}
