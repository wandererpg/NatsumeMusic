import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/main/database/connection';
import { getSetting, setSetting } from '../../src/main/database/queries/settings';
import { prepareUpdate, openDatabaseWithVersionBackup } from '../../src/main/services/update-backup';

describe('update database protection', () => {
  it('backs up committed WAL data and saves a validated playback snapshot', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'natsume-update-'));
    const db = openDatabase(dir);
    try {
      setSetting(db, 'library_path', 'D:/MyMusic');
      setSetting(db, 'volume', '0.4');
      const snapshot = { trackId: null, currentTime: 12.5 };
      const backupPath = await prepareUpdate(db, dir, '0.1.1', snapshot);
      const backup = new Database(backupPath, { readonly: true });
      try {
        expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(getSetting(backup, 'library_path')).toBe('D:/MyMusic');
        expect(getSetting(backup, 'update_playback_snapshot')).toBe(JSON.stringify(snapshot));
      } finally { backup.close(); }
      expect(db.open).toBe(true);
    } finally { db.close(); await fs.rm(dir, { recursive: true, force: true }); }
  });
  it('keeps the database open and rolls back playback record if backup fails', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'natsume-update-'));
    const db = openDatabase(dir);
    try {
      setSetting(db, 'update_playback_snapshot', 'old');
      setSetting(db, 'update_resume_pending', 'false');
      setSetting(db, 'last_track_id', 'old-track');
      const backup = vi.spyOn(db, 'backup').mockRejectedValueOnce(new Error('backup failed'));
      await expect(prepareUpdate(db, dir, '0.1.1', { trackId: null, currentTime: 0 })).rejects.toThrow();
      expect(backup).toHaveBeenCalledOnce();
      expect(getSetting(db, 'update_playback_snapshot')).toBe('old');
      expect(getSetting(db, 'update_resume_pending')).toBe('false');
      expect(getSetting(db, 'last_track_id')).toBe('old-track');
      expect(db.open).toBe(true);
    } finally { db.close(); await fs.rm(dir, { recursive: true, force: true }); }
  });
  it('creates a pre-migration backup on version changes, only once per version', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'natsume-update-'));
    try {
      const initial = await openDatabaseWithVersionBackup(dir, '0.1.1');
      setSetting(initial, 'library_path', 'D:/Music'); initial.close();
      const next = await openDatabaseWithVersionBackup(dir, '0.1.2'); next.close();
      const backups = await fs.readdir(path.join(dir, 'backups'));
      expect(backups).toHaveLength(1);
      const again = await openDatabaseWithVersionBackup(dir, '0.1.2'); again.close();
      expect(await fs.readdir(path.join(dir, 'backups'))).toEqual(backups);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
