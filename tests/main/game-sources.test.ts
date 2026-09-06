import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame, getGame, setGameCover } from '../../src/main/database/queries/games';
import {
  getGameSources,
  upsertGameSource,
  type GameSourceInput,
} from '../../src/main/database/queries/game-sources';

describe('game metadata source queries', () => {
  it('upgrades legacy covers to manual ownership', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare('INSERT INTO games (id, name, cover_path) VALUES (?, ?, ?)').run('g1', 'ATRI', 'C:/lib/.cover.jpg');

    // Exercise the v4 -> v5 path without requiring a file-backed legacy DB.
    db.pragma('user_version = 4');
    migrate(db);

    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(getGame(db, 'g1')?.coverSource).toBe('manual');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_sources'").get()).toEqual({ name: 'game_sources' });
    db.close();
  });

  it('upserts source state for a game and preserves retry metadata', () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });

    const input: GameSourceInput = {
      gameId: 'g1',
      source: 'vndb',
      externalId: 'v17',
      queryName: 'ATRI',
      status: 'failed',
      dataJson: JSON.stringify({ matched: null, candidates: [] }),
      imageUrl: null,
      fetchedAt: '2026-08-24T00:00:00.000Z',
      retryAfter: '2026-08-24T00:30:00.000Z',
      errorMessage: 'offline',
    };
    upsertGameSource(db, input);

    expect(getGameSources(db, 'g1')[0]).toMatchObject(input);
    db.close();
  });

  it('records explicit automatic and manual cover sources', () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });

    expect(setGameCover(db, 'g1', 'C:/lib/.cover.jpg', 'vndb')?.coverSource).toBe('vndb');
    expect(setGameCover(db, 'g1', 'C:/lib/manual.jpg')?.coverSource).toBe('manual');
    expect(setGameCover(db, 'g1', null)?.coverSource).toBeNull();
    db.close();
  });
});
