import type Database from 'better-sqlite3';

import type { MetadataSource, MetadataStatus } from '../../../shared/types';

type SQLiteDatabase = Database.Database;

export interface GameSourceInput {
  gameId: string;
  source: MetadataSource;
  externalId: string | null;
  queryName: string;
  status: MetadataStatus;
  dataJson: string | null;
  imageUrl: string | null;
  fetchedAt: string | null;
  retryAfter: string | null;
  errorMessage: string | null;
}

export interface GameSourceRow extends GameSourceInput {}

const SOURCE_SELECT = `
  SELECT
    game_id AS gameId,
    source,
    external_id AS externalId,
    query_name AS queryName,
    status,
    data_json AS dataJson,
    image_url AS imageUrl,
    fetched_at AS fetchedAt,
    retry_after AS retryAfter,
    error_message AS errorMessage
  FROM game_sources
`;

export function getGameSource(
  db: SQLiteDatabase,
  gameId: string,
  source: MetadataSource,
): GameSourceRow | undefined {
  return db.prepare(`${SOURCE_SELECT} WHERE game_id = ? AND source = ?`).get(gameId, source) as GameSourceRow | undefined;
}

export function getGameSources(db: SQLiteDatabase, gameId: string): GameSourceRow[] {
  return db.prepare(`${SOURCE_SELECT} WHERE game_id = ? ORDER BY source ASC`).all(gameId) as GameSourceRow[];
}

export function upsertGameSource(db: SQLiteDatabase, input: GameSourceInput): GameSourceRow {
  db.prepare(`
    INSERT INTO game_sources (
      game_id, source, external_id, query_name, status, data_json, image_url,
      fetched_at, retry_after, error_message
    ) VALUES (
      @gameId, @source, @externalId, @queryName, @status, @dataJson, @imageUrl,
      @fetchedAt, @retryAfter, @errorMessage
    )
    ON CONFLICT (game_id, source) DO UPDATE SET
      external_id = excluded.external_id,
      query_name = excluded.query_name,
      status = excluded.status,
      data_json = excluded.data_json,
      image_url = excluded.image_url,
      fetched_at = excluded.fetched_at,
      retry_after = excluded.retry_after,
      error_message = excluded.error_message
  `).run(input);

  return getGameSource(db, input.gameId, input.source)!;
}

export function deleteGameSources(db: SQLiteDatabase, gameId: string): number {
  return db.prepare('DELETE FROM game_sources WHERE game_id = ?').run(gameId).changes;
}
