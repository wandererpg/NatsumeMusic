import type Database from 'better-sqlite3';
import type { Playlist, PlaylistInput, Track } from '../../../shared/types';
import { listTracks } from './tracks';

type SQLiteDatabase = Database.Database;

interface PlaylistRow {
  id: string;
  name: string;
  trackCount: number;
  createdAt: string;
}

function mapPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    trackIds: [],
    trackCount: Number(row.trackCount),
    createdAt: row.createdAt,
  };
}

export function listPlaylists(db: SQLiteDatabase): Playlist[] {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      COUNT(pt.track_id) AS trackCount,
      p.created_at AS createdAt
    FROM playlists AS p
    LEFT JOIN playlist_tracks AS pt ON pt.playlist_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at ASC, p.id ASC
  `).all() as PlaylistRow[];
  return rows.map(mapPlaylist);
}

export function createPlaylist(db: SQLiteDatabase, input: PlaylistInput): Playlist {
  db.prepare('INSERT INTO playlists (id, name) VALUES (?, ?)').run(input.id, input.name.trim());
  return listPlaylists(db).find((playlist) => playlist.id === input.id)!;
}

export function deletePlaylist(db: SQLiteDatabase, id: string): boolean {
  const result = db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  return result.changes > 0;
}

export function addTrackToPlaylist(db: SQLiteDatabase, playlistId: string, trackId: string): boolean {
  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as { next: number };
  const result = db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `).run(playlistId, trackId, position.next);
  return result.changes > 0;
}

export function addTracksToPlaylist(
  db: SQLiteDatabase,
  playlistId: string,
  trackIds: string[],
): number {
  if (trackIds.length === 0) return 0;
  const position = db.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?',
  ).get(playlistId) as { next: number };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
  `);
  let nextPosition = position.next;
  let inserted = 0;
  for (const trackId of trackIds) {
    const result = insert.run(playlistId, trackId, nextPosition);
    if (result.changes > 0) {
      inserted += 1;
      nextPosition += 1;
    }
  }
  return inserted;
}

export function removeTrackFromPlaylist(db: SQLiteDatabase, playlistId: string, trackId: string): boolean {
  const result = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
  return result.changes > 0;
}

export function listPlaylistTracks(db: SQLiteDatabase, playlistId: string): Track[] {
  const rows = db.prepare(`
    SELECT t.id
    FROM playlist_tracks AS pt
    INNER JOIN tracks AS t ON t.id = pt.track_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC, t.id ASC
  `).all(playlistId) as Array<{ id: string }>;
  const tracks = new Map(listTracks(db).map((track) => [track.id, track]));
  return rows.map((row) => tracks.get(row.id)).filter((track): track is Track => Boolean(track));
}
