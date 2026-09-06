import type Database from 'better-sqlite3';
import type { Track, TrackKind, TrackUpdate } from '../../../shared/types';

type SQLiteDatabase = Database.Database;

export interface TrackInput {
  id: string;
  gameId: string;
  filePath: string;
  fileName: string;
  customName?: string | null;
  duration?: number | null;
  format: string;
  fileSize: number;
  fileHash: string;
  trackNumber?: number;
  kind?: TrackKind;
}

interface TrackRow {
  id: string;
  gameId: string;
  gameName: string;
  filePath: string;
  fileName: string;
  customName: string | null;
  displayName: string;
  duration: number | null;
  kind: TrackKind;
  format: string;
  fileSize: number;
  fileHash: string;
  trackNumber: number;
  isFavorite: number;
  createdAt: string;
  updatedAt: string;
}

const TRACK_SELECT = `
  SELECT
    t.id,
    t.game_id AS gameId,
    g.name AS gameName,
    t.file_path AS filePath,
    t.file_name AS fileName,
    t.custom_name AS customName,
    COALESCE(NULLIF(t.custom_name, ''), t.file_name) AS displayName,
    t.duration,
    t.kind,
    t.format,
    t.file_size AS fileSize,
    t.file_hash AS fileHash,
    t.track_number AS trackNumber,
    t.is_favorite AS isFavorite,
    t.created_at AS createdAt,
    t.updated_at AS updatedAt
  FROM tracks AS t
  INNER JOIN games AS g ON g.id = t.game_id
`;

function mapTrack(row: TrackRow | undefined): Track | undefined {
  if (!row) return undefined;
  return { ...row, isFavorite: Boolean(row.isFavorite) };
}

export function listTracks(
  db: SQLiteDatabase,
  gameId?: string | null,
  options?: { search?: string; favoritesOnly?: boolean; order?: 'track' | 'recent'; kind?: TrackKind | null } | string,
): Track[] {
  const search = typeof options === 'string' ? options : options?.search;
  const favoritesOnly = typeof options === 'string' ? false : options?.favoritesOnly ?? false;
  const order = typeof options === 'string' ? 'track' : options?.order ?? 'track';
  const kind = typeof options === 'string' ? null : options?.kind;
  const clauses: string[] = [];
  const parameters: Array<string | number | null> = [];

  if (gameId !== undefined && gameId !== null) {
    clauses.push('t.game_id = ?');
    parameters.push(gameId);
  }
  if (favoritesOnly) {
    clauses.push('t.is_favorite = 1');
  }
  if (kind) {
    clauses.push('t.kind = ?');
    parameters.push(kind);
  }
  if (search && search.trim()) {
    clauses.push(`(
      t.file_name LIKE ? COLLATE NOCASE OR
      COALESCE(t.custom_name, '') LIKE ? COLLATE NOCASE OR
      g.name LIKE ? COLLATE NOCASE
    )`);
    const pattern = `%${search.trim()}%`;
    parameters.push(pattern, pattern, pattern);
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = order === 'recent'
    ? 't.created_at DESC, t.updated_at DESC, t.id ASC'
    : 't.track_number ASC, t.file_name COLLATE NOCASE ASC, t.id ASC';
  const rows = db.prepare(`${TRACK_SELECT}${where} ORDER BY ${orderBy}`).all(...parameters) as TrackRow[];
  return rows.map((row) => mapTrack(row)!);
}

export function getTrack(db: SQLiteDatabase, id: string): Track | undefined {
  const row = db.prepare(`${TRACK_SELECT} WHERE t.id = ?`).get(id) as TrackRow | undefined;
  return mapTrack(row);
}

export function getTracksByIds(db: SQLiteDatabase, ids: string[]): Track[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`${TRACK_SELECT} WHERE t.id IN (${placeholders})`).all(...ids) as TrackRow[];
  const tracksById = new Map(rows.map((row) => {
    const track = mapTrack(row)!;
    return [track.id, track] as const;
  }));
  return ids.map((id) => tracksById.get(id)).filter((track): track is Track => Boolean(track));
}

export function insertTrack(db: SQLiteDatabase, input: TrackInput): Track {
  db.prepare(`
    INSERT INTO tracks (
      id, game_id, file_path, file_name, custom_name, duration,
      format, file_size, file_hash, track_number, kind
    ) VALUES (
      @id, @gameId, @filePath, @fileName, @customName, @duration,
      @format, @fileSize, @fileHash, @trackNumber, @kind
    )
  `).run({
    id: input.id,
    gameId: input.gameId,
    filePath: input.filePath,
    fileName: input.fileName,
    customName: input.customName ?? null,
    duration: input.duration ?? null,
    format: input.format,
    fileSize: input.fileSize,
    fileHash: input.fileHash,
    trackNumber: input.trackNumber ?? 0,
    kind: input.kind ?? 'music',
  });

  return getTrack(db, input.id)!;
}

export function updateTrack(db: SQLiteDatabase, id: string, changes: TrackUpdate): Track | undefined {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];

  if (Object.prototype.hasOwnProperty.call(changes, 'customName')) {
    assignments.push('custom_name = ?');
    values.push(changes.customName ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'trackNumber')) {
    assignments.push('track_number = ?');
    values.push(changes.trackNumber ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'isFavorite')) {
    assignments.push('is_favorite = ?');
    values.push(changes.isFavorite ? 1 : 0);
  }
  if (assignments.length === 0) {
    return getTrack(db, id);
  }

  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  values.push(id);
  const result = db.prepare(`UPDATE tracks SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return result.changes === 0 ? undefined : getTrack(db, id);
}

/** Internal metadata refresh; duration is intentionally not exposed over IPC. */
export function updateTrackMetadata(
  db: SQLiteDatabase,
  id: string,
  changes: { duration?: number | null; customName?: string | null },
): Track | undefined {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  if (Object.prototype.hasOwnProperty.call(changes, 'duration')) {
    assignments.push('duration = ?');
    values.push(changes.duration ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'customName')) {
    assignments.push('custom_name = ?');
    values.push(changes.customName ?? null);
  }
  if (assignments.length === 0) return getTrack(db, id);
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
  values.push(id);
  const result = db.prepare(`UPDATE tracks SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
  return result.changes === 0 ? undefined : getTrack(db, id);
}

/** Update one copied file path after its owning game directory is renamed. */
export function updateTrackFilePath(db: SQLiteDatabase, id: string, filePath: string): boolean {
  const result = db.prepare(`
    UPDATE tracks
    SET file_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(filePath, id);
  return result.changes > 0;
}

export function setTracksFavorite(db: SQLiteDatabase, ids: string[], value: boolean): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const result = db.prepare(`
    UPDATE tracks
    SET is_favorite = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id IN (${placeholders})
  `).run(value ? 1 : 0, ...ids);
  return result.changes;
}

export function moveTrackRecord(
  db: SQLiteDatabase,
  id: string,
  changes: { gameId: string; filePath: string; fileName: string },
): boolean {
  const result = db.prepare(`
    UPDATE tracks
    SET game_id = ?, file_path = ?, file_name = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(changes.gameId, changes.filePath, changes.fileName, id);
  return result.changes > 0;
}

export function updateTrackStorage(
  db: SQLiteDatabase,
  id: string,
  changes: { filePath: string; fileName: string; duration: number | null; kind: TrackKind },
): boolean {
  const result = db.prepare(`
    UPDATE tracks
    SET file_path = ?, file_name = ?, duration = ?, kind = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(changes.filePath, changes.fileName, changes.duration, changes.kind, id);
  return result.changes > 0;
}

export function deleteTrack(db: SQLiteDatabase, id: string): boolean {
  const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteTracks(db: SQLiteDatabase, ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  return db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...ids).changes;
}

export function findTrackByHash(db: SQLiteDatabase, fileHash: string): Track | undefined {
  const row = db
    .prepare(`${TRACK_SELECT} WHERE t.file_hash = ? ORDER BY t.created_at ASC, t.id ASC LIMIT 1`)
    .get(fileHash) as TrackRow | undefined;
  return mapTrack(row);
}
