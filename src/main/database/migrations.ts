import type Database from 'better-sqlite3';

/**
 * The schema is versioned with SQLite's user_version pragma as well as a
 * small migrations table.  Keeping both makes the database easy to inspect
 * and gives us a place to add non-destructive migrations in future releases.
 */
export const LATEST_SCHEMA_VERSION = 5;

type SQLiteDatabase = Database.Database;

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS games (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    cover_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS tracks (
    id           TEXT PRIMARY KEY,
    game_id      TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    file_name    TEXT NOT NULL,
    custom_name  TEXT,
    duration     REAL,
    format       TEXT NOT NULL,
    file_size    INTEGER NOT NULL,
    file_hash    TEXT NOT NULL,
    track_number INTEGER NOT NULL DEFAULT 0,
    is_favorite  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tracks_game_id ON tracks(game_id);
  CREATE INDEX IF NOT EXISTS idx_tracks_file_hash ON tracks(file_hash);
  CREATE INDEX IF NOT EXISTS idx_tracks_custom_name ON tracks(custom_name);

  CREATE TABLE IF NOT EXISTS playlists (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id    TEXT NOT NULL,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('library_path', ''),
    ('volume', '0.8'),
    ('play_mode', 'list-loop'),
    ('voice_threshold_seconds', '25'),
    ('theme', 'afterglow-teal');
`;

/** Apply all schema migrations required by the current application. */
export function migrate(db: SQLiteDatabase): void {
  // This pragma must be enabled outside a transaction in SQLite.
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const userVersion = Number(db.pragma('user_version', { simple: true }) ?? 0);
  if (userVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  const applyMigrations = db.transaction(() => {
    if (userVersion < 1) {
      db.exec(INITIAL_SCHEMA);
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(1);
    }

    if (userVersion < 2) {
      const columns = db.prepare('PRAGMA table_info(tracks)').all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === 'is_favorite')) {
        db.exec('ALTER TABLE tracks ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0');
      }
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(2);
    }

    if (userVersion < 3) {
      const columns = db.prepare('PRAGMA table_info(tracks)').all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === 'kind')) {
        db.exec("ALTER TABLE tracks ADD COLUMN kind TEXT NOT NULL DEFAULT 'music' CHECK (kind IN ('music', 'voice'))");
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_game_kind ON tracks(game_id, kind)');
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(3);
    }

    if (userVersion < 4) {
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('voice_threshold_seconds', '25')").run();
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(4);
    }

    if (userVersion < 5) {
      const gameColumns = db.prepare('PRAGMA table_info(games)').all() as Array<{ name: string }>;
      if (!gameColumns.some((column) => column.name === 'cover_source')) {
        db.exec("ALTER TABLE games ADD COLUMN cover_source TEXT CHECK (cover_source IN ('manual', 'vndb', 'bangumi'))");
      }
      db.exec(`
        UPDATE games
        SET cover_source = 'manual'
        WHERE cover_path IS NOT NULL AND cover_source IS NULL;

        CREATE TABLE IF NOT EXISTS game_sources (
          game_id       TEXT NOT NULL,
          source        TEXT NOT NULL CHECK (source IN ('vndb', 'bangumi')),
          external_id   TEXT,
          query_name    TEXT NOT NULL,
          status        TEXT NOT NULL CHECK (status IN ('pending', 'matched', 'no_match', 'failed', 'ambiguous')),
          data_json     TEXT,
          image_url     TEXT,
          fetched_at    TEXT,
          retry_after   TEXT,
          error_message TEXT,
          PRIMARY KEY (game_id, source),
          FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
        );
      `);
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(5);
    }

    db.pragma(`user_version = ${LATEST_SCHEMA_VERSION}`);
  });

  applyMigrations();
}
