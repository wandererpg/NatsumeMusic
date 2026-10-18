import Database from 'better-sqlite3';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { getGameSource, upsertGameSource } from '../../src/main/database/queries/game-sources';
import { openDatabaseWithVersionBackup } from '../../src/main/services/update-backup';

function legacyVersionSix(db: Database.Database) {
  migrate(db);
  for (const column of ['match_method', 'confirmed_at', 'revision', 'search_status', 'search_error', 'search_fetched_at']) {
    db.exec(`ALTER TABLE game_sources DROP COLUMN ${column}`);
  }
  db.pragma('user_version = 6');
  db.prepare('DELETE FROM schema_migrations WHERE version > 6').run();
  createGame(db, { id: 'legacy', name: 'Legacy work' });
  db.prepare(`INSERT INTO game_sources (game_id, source, external_id, query_name, status, data_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run('legacy', 'vndb', 'v17', 'Legacy work', 'matched', '{"cached":"original"}');
}

describe('metadata schema upgrade', () => {
  it('upgrades an existing version 6 database missing selection columns without losing cached bindings', () => {
    const db = new Database(':memory:');
    try {
      legacyVersionSix(db);
      expect(() => getGameSource(db, 'legacy', 'vndb')).toThrow('no such column: match_method');
      migrate(db);
      expect(getGameSource(db, 'legacy', 'vndb')).toMatchObject({
        externalId: 'v17', status: 'matched', dataJson: '{"cached":"original"}',
        matchMethod: 'auto', confirmedAt: null, revision: 0,
      });
      expect(db.pragma('user_version', { simple: true })).toBe(7);
      migrate(db);
      expect(db.prepare('SELECT COUNT(*) AS count FROM game_sources').get()).toEqual({ count: 1 });
    } finally { db.close(); }
  });

  it('preserves already-confirmed bindings in development databases with version 6 selection columns', () => {
    const db = new Database(':memory:');
    try {
      migrate(db);
      createGame(db, { id: 'manual', name: 'Manual work' });
      const before = upsertGameSource(db, {
        gameId: 'manual', source: 'vndb', externalId: 'v17', queryName: 'Manual work', status: 'matched',
        dataJson: '{}', imageUrl: null, fetchedAt: null, retryAfter: null, errorMessage: null,
        matchMethod: 'manual', confirmedAt: '2026-10-14T00:00:00.000Z', revision: 5,
      });
      db.pragma('user_version = 6');
      db.prepare('DELETE FROM schema_migrations WHERE version > 6').run();
      migrate(db);
      expect(getGameSource(db, 'manual', 'vndb')).toEqual(before);
      expect(db.pragma('user_version', { simple: true })).toBe(7);
    } finally { db.close(); }
  });

  it('backs up a schema upgrade even when the app version is unchanged', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'natsume-schema-'));
    try {
      const db = new Database(path.join(directory, 'galmusic.db'));
      legacyVersionSix(db);
      db.close();
      await writeFile(path.join(directory, 'app-database-version'), '0.1.2');
      const upgraded = await openDatabaseWithVersionBackup(directory, '0.1.2');
      try {
        const backups = await readdir(path.join(directory, 'backups'));
        expect(backups).toHaveLength(1);
        const backup = new Database(path.join(directory, 'backups', backups[0]), { readonly: true });
        try {
          expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
          expect(backup.pragma('user_version', { simple: true })).toBe(6);
          expect(() => getGameSource(backup, 'legacy', 'vndb')).toThrow('no such column: match_method');
        } finally { backup.close(); }
        expect(getGameSource(upgraded, 'legacy', 'vndb')?.externalId).toBe('v17');
      } finally { upgraded.close(); }
      const again = await openDatabaseWithVersionBackup(directory, '0.1.2');
      again.close();
      expect(await readdir(path.join(directory, 'backups'))).toHaveLength(1);
      expect(await readFile(path.join(directory, 'app-database-version'), 'utf8')).toBe('0.1.2');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
