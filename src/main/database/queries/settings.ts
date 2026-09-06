import type Database from 'better-sqlite3';

type SQLiteDatabase = Database.Database;

export function getSetting(db: SQLiteDatabase, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: SQLiteDatabase, key: string, value: string): string {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
  return value;
}

