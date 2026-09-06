import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { migrate } from './migrations';

export type SQLiteDatabase = Database.Database;

/** Resolve the on-disk database location for a user data directory. */
export function getDatabasePath(userDataDirectory: string): string {
  return path.join(userDataDirectory, 'galmusic.db');
}

/**
 * Open a GalMusic database, creating its parent directory and schema when
 * needed.  Each invocation returns an independent connection and runs the
 * migrations exactly once for that connection.
 */
export function openDatabase(userDataDirectory: string): SQLiteDatabase {
  const databasePath = getDatabasePath(userDataDirectory);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  try {
    // WAL allows the renderer-facing reads to coexist with import writes.
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// These aliases keep the connection module convenient for callers that use
// either naming convention without creating additional connection logic.
export const createDatabase = openDatabase;
export const connectDatabase = openDatabase;
export default openDatabase;

