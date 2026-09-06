import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { openDatabase } from '../../src/main/database/connection';
import { migrate } from '../../src/main/database/migrations';
import { createGame, deleteGame, listGames, setGameCover } from '../../src/main/database/queries/games';
import {
  deleteTrack,
  findTrackByHash,
  insertTrack,
  listTracks,
  updateTrack,
} from '../../src/main/database/queries/tracks';
import { getSetting, setSetting } from '../../src/main/database/queries/settings';

describe('library database', () => {
  it('migrates and creates a game with zero tracks', () => {
    const db = new Database(':memory:');
    migrate(db);

    const game = createGame(db, { id: 'g1', name: 'ATRI' });

    expect(game.name).toBe('ATRI');
    expect(game.coverPath).toBeNull();
    expect(listGames(db)[0].trackCount).toBe(0);
    db.close();
  });

  it('cascades track deletion when a game is removed', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare('INSERT INTO games (id, name) VALUES (?, ?)').run('g1', 'ATRI');
    db.prepare(`INSERT INTO tracks
      (id, game_id, file_path, file_name, file_hash, format, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('t1', 'g1', 'C:/lib/a.ogg', 'a.ogg', 'h1', 'ogg', 10);

    db.prepare('DELETE FROM games WHERE id = ?').run('g1');

    expect(db.prepare('SELECT COUNT(*) AS count FROM tracks').get()).toEqual({ count: 0 });
    db.close();
  });

  it('supports track insert, lookup, update, listing, and deletion', () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });

    const track = insertTrack(db, {
      id: 't1',
      gameId: 'g1',
      filePath: 'C:/lib/a.ogg',
      fileName: 'a.ogg',
      format: 'ogg',
      fileSize: 10,
      fileHash: 'h1',
      duration: 12.5,
      kind: 'voice',
      trackNumber: 2,
    });

    expect(track.displayName).toBe('a.ogg');
    expect(track.kind).toBe('voice');
    expect(findTrackByHash(db, 'h1')?.id).toBe('t1');
    expect(listTracks(db, 'g1')).toHaveLength(1);
    expect(listTracks(db, 'g1', { kind: 'music' })).toHaveLength(0);
    expect(listTracks(db, 'g1', { kind: 'voice' })).toHaveLength(1);
    expect(updateTrack(db, 't1', { customName: 'Opening', trackNumber: 1 })?.displayName).toBe('Opening');
    expect(deleteTrack(db, 't1')).toBe(true);
    expect(findTrackByHash(db, 'h1')).toBeUndefined();
    db.close();
  });

  it('updates game covers and upserts settings', () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });

    expect(setGameCover(db, 'g1', 'C:/lib/cover.png')?.coverPath).toBe('C:/lib/cover.png');
    expect(setSetting(db, 'volume', '0.5')).toBe('0.5');
    expect(getSetting(db, 'volume')).toBe('0.5');
    expect(getSetting(db, 'missing')).toBeUndefined();
    db.close();
  });

  it('opens a durable WAL database and keeps migrations idempotent', async () => {
    const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'galmusic-db-'));
    const db = openDatabase(userDataDirectory);

    expect(existsSync(path.join(userDataDirectory, 'galmusic.db'))).toBe(true);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('user_version', { simple: true })).toBe(5);

    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    db.close();
  });
});
