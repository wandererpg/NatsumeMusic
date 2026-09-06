import type Database from 'better-sqlite3';
import path from 'node:path';
import type { CoverSource, Game } from '../../../shared/types';

type SQLiteDatabase = Database.Database;

export interface GameInput {
  id: string;
  name: string;
  coverPath?: string | null;
}

interface GameRow {
  id: string;
  name: string;
  coverPath: string | null;
  coverSource: CoverSource;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
  firstTrackPath?: string | null;
}

function mapGame(row: GameRow | undefined): Game | undefined {
  if (!row) return undefined;
  const { firstTrackPath, ...game } = row;
  return {
    ...game,
    coverSource: game.coverSource ?? null,
    folderPath: firstTrackPath ? path.dirname(firstTrackPath) : null,
  };
}

const GAME_SELECT = `
  SELECT
    g.id,
    g.name,
    g.cover_path AS coverPath,
    g.cover_source AS coverSource,
    COUNT(t.id) AS trackCount,
    g.created_at AS createdAt,
    g.updated_at AS updatedAt,
    MIN(t.file_path) AS firstTrackPath
  FROM games AS g
  LEFT JOIN tracks AS t ON t.game_id = g.id
`;

export function createGame(db: SQLiteDatabase, input: GameInput): Game {
  db.prepare(`
    INSERT INTO games (id, name, cover_path)
    VALUES (@id, @name, @coverPath)
  `).run({
    id: input.id,
    name: input.name,
    coverPath: input.coverPath ?? null,
  });

  return getGame(db, input.id)!;
}

export function listGames(db: SQLiteDatabase): Game[] {
  const rows = db.prepare(`${GAME_SELECT} GROUP BY g.id ORDER BY g.created_at ASC, g.id ASC`).all() as GameRow[];
  return rows.map((row) => mapGame(row)!);
}

export function getGame(db: SQLiteDatabase, id: string): Game | undefined {
  const row = db
    .prepare(`${GAME_SELECT} WHERE g.id = ? GROUP BY g.id`)
    .get(id) as GameRow | undefined;
  return mapGame(row);
}

/** Find the first game with a matching display name for repeat imports. */
export function findGameByName(db: SQLiteDatabase, name: string): Game | undefined {
  const row = db
    .prepare(`${GAME_SELECT} WHERE g.name = ? GROUP BY g.id ORDER BY g.created_at ASC, g.id ASC LIMIT 1`)
    .get(name) as GameRow | undefined;
  return mapGame(row);
}

export function deleteGame(db: SQLiteDatabase, id: string): boolean {
  const result = db.prepare('DELETE FROM games WHERE id = ?').run(id);
  return result.changes > 0;
}

export function setGameCover(
  db: SQLiteDatabase,
  id: string,
  coverPath: string | null,
  coverSource: CoverSource = coverPath ? 'manual' : null,
): Game | undefined {
  const result = db.prepare(`
    UPDATE games
    SET cover_path = ?, cover_source = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(coverPath, coverSource, id);
  if (result.changes === 0) {
    return undefined;
  }
  return getGame(db, id);
}

export function renameGame(db: SQLiteDatabase, id: string, name: string): Game | undefined {
  const result = db.prepare(`
    UPDATE games
    SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(name, id);
  return result.changes === 0 ? undefined : getGame(db, id);
}
