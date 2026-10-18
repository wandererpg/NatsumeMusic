import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { getDatabasePath, type SQLiteDatabase } from '../database/connection';
import { LATEST_SCHEMA_VERSION, migrate } from '../database/migrations';
import { getSetting, setSetting } from '../database/queries/settings';
import type { PlaybackSnapshot } from '../../shared/types';
import { randomUUID } from 'node:crypto';

function backupName(directory: string, version: string, reason: string): string {
  return path.join(directory, 'backups', `galmusic-${version.replace(/[^a-zA-Z0-9.-]/g, '_')}-${reason}-${Date.now()}-${randomUUID()}.db`);
}

export async function prepareUpdate(db: SQLiteDatabase, directory: string, version: string, snapshot: PlaybackSnapshot): Promise<string> {
  await fs.mkdir(path.join(directory, 'backups'), { recursive: true });
  const values = {
    update_playback_snapshot: JSON.stringify(snapshot),
    update_resume_pending: 'true',
    last_track_id: snapshot.trackId ?? '',
  };
  const previous = Object.keys(values).map((key) => [key, getSetting(db, key)] as const);
  db.transaction(() => { for (const [key, value] of Object.entries(values)) setSetting(db, key, value); })();
  const backupPath = backupName(directory, version, 'before-install');
  try {
    // SQLite's backup API includes committed WAL pages in a consistent snapshot.
    await db.backup(backupPath);
    return backupPath;
  } catch (error) {
    db.transaction(() => {
      for (const [key, value] of previous) {
        if (value === undefined) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        else setSetting(db, key, value);
      }
    })();
    throw error;
  }
}

/** Take a consistent snapshot before any schema migrations after an upgrade. */
export async function openDatabaseWithVersionBackup(directory: string, version: string): Promise<SQLiteDatabase> {
  await fs.mkdir(directory, { recursive: true });
  const databasePath = getDatabasePath(directory);
  const markerPath = path.join(directory, 'app-database-version');
  const previousVersion = await fs.readFile(markerPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const existing = await fs.stat(databasePath).then((stat) => stat.size > 0).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  const db = new Database(databasePath);
  try {
    db.pragma('busy_timeout = 5000');
    const schemaVersion = Number(db.pragma('user_version', { simple: true }) ?? 0);
    if (existing && (previousVersion !== version || schemaVersion < LATEST_SCHEMA_VERSION)) {
      await fs.mkdir(path.join(directory, 'backups'), { recursive: true });
      await db.backup(backupName(directory, version, 'before-migration'));
    }
    db.pragma('journal_mode = WAL');
    migrate(db);
    await fs.writeFile(markerPath, version, 'utf8');
    return db;
  } catch (error) { db.close(); throw error; }
}
