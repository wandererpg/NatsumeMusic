import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, dialog: {}, ipcMain: {}, net: {}, shell: {}, protocol: { registerSchemesAsPrivileged: vi.fn() } }));

import { createDatabaseLibraryService } from '../../src/main/index';
import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { getTrack, insertTrack, listTracks, updateTrack } from '../../src/main/database/queries/tracks';
import { addTrackToPlaylist, createPlaylist, listPlaylistTracks } from '../../src/main/database/queries/playlists';
import { getSetting, setSetting } from '../../src/main/database/queries/settings';
import { readAppSettings } from '../../src/main/services/settings';

let root: string;
let db: Database.Database;
let bytes: Buffer;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'natsume-library-directory-'));
  db = new Database(':memory:'); migrate(db);
  bytes = Buffer.alloc(44 + 8000 * 30 * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
});
afterEach(async () => { db.close(); await rm(root, { recursive: true, force: true }); });
const saveDirectory = (directory: string) => createDatabaseLibraryService(db).saveSettings!({ ...readAppSettings(db), fontColor: null, libraryPath: directory, rescanLibrary: true });

it('saves appearance without entering the library scan gate', async () => {
  const directory = path.join(root, 'music');
  await mkdir(directory);
  await saveDirectory(directory);
  const changeLibrary = vi.fn(async () => { throw new Error('Appearance save unexpectedly scans the library'); });
  const service = createDatabaseLibraryService(db, { changeLibrary });
  await expect(service.saveSettings!({ ...readAppSettings(db), fontColor: null, themeId: 'neon-terminal' })).resolves.toBeUndefined();
  expect(changeLibrary).not.toHaveBeenCalled();
  expect(readAppSettings(db).themeId).toBe('neon-terminal');
});

it('indexes songs already in a selected directory recursively without copying or moving them', async () => {
  const directory = path.join(root, 'new');
  const album = path.join(directory, 'ATRI', '音乐');
  await mkdir(album, { recursive: true });
  const file = path.join(album, 'theme.wav');
  await writeFile(file, bytes);
  await saveDirectory(directory);
  const tracks = listTracks(db);
  expect(tracks).toHaveLength(1);
  expect(tracks[0]).toMatchObject({ filePath: file, gameName: 'ATRI', fileName: 'theme.wav', duration: 30, kind: 'music' });
  expect(await readdir(album)).toEqual(['theme.wav']);
  expect(await readFile(file)).toEqual(bytes);
});

it('relinks matching moved songs while retaining IDs, custom names, favorites and playlist membership', async () => {
  const oldDirectory = path.join(root, 'old');
  const directory = path.join(root, 'new');
  await mkdir(directory);
  const file = path.join(directory, 'renamed.wav');
  await writeFile(file, bytes);
  setSetting(db, 'library_path', oldDirectory);
  createGame(db, { id: 'g1', name: 'Original Game' });
  insertTrack(db, { id: 't1', gameId: 'g1', filePath: path.join(oldDirectory, 'theme.wav'), fileName: 'theme.wav', customName: 'My Song', duration: 30, format: 'wav', fileSize: bytes.length, fileHash: createHash('md5').update(bytes).digest('hex') });
  updateTrack(db, 't1', { isFavorite: true });
  const playlist = createPlaylist(db, { id: 'p1', name: 'Keep' }); addTrackToPlaylist(db, playlist.id, 't1');
  await saveDirectory(directory);
  expect(getTrack(db, 't1')).toMatchObject({ filePath: file, fileName: 'renamed.wav', customName: 'My Song', isFavorite: true });
  expect(listTracks(db)).toHaveLength(1);
  expect(listPlaylistTracks(db, 'p1')[0].id).toBe('t1');
});

it('rescans the same directory so a previously saved path and newly added songs can be repaired', async () => {
  const directory = path.join(root, 'new'); await mkdir(directory);
  setSetting(db, 'library_path', directory);
  await writeFile(path.join(directory, 'theme.wav'), bytes);
  await saveDirectory(directory); await saveDirectory(directory);
  expect(listTracks(db)).toHaveLength(1);
});

it('does not commit the selected path or other preferences when the folder cannot be scanned', async () => {
  setSetting(db, 'library_path', root); setSetting(db, 'volume', '0.4');
  const file = path.join(root, 'not-a-folder'); await writeFile(file, 'file');
  await expect(Promise.resolve().then(() => createDatabaseLibraryService(db).saveSettings!({ ...readAppSettings(db), fontColor: null, libraryPath: file, volume: .1 }))).rejects.toThrow();
  expect(getSetting(db, 'library_path')).toBe(root);
  expect(getSetting(db, 'volume')).toBe('0.4');
});

it('keeps old library records but shows only songs belonging to the selected directory', async () => {
  createGame(db, { id: 'old-game', name: 'Old' });
  insertTrack(db, { id: 'old-track', gameId: 'old-game', filePath: path.join(root, 'old', 'old.wav'), fileName: 'old.wav', format: 'wav', fileSize: 1, fileHash: 'old' });
  const directory = path.join(root, 'new'); await mkdir(directory); await writeFile(path.join(directory, 'new.wav'), bytes);
  const service = createDatabaseLibraryService(db);
  await service.saveSettings!({ ...readAppSettings(db), fontColor: null, libraryPath: directory });
  expect(await service.getTracks(null)).toHaveLength(1);
  expect((await service.getGames()).map(game => game.name)).toEqual(['new']);
  expect(getTrack(db, 'old-track')).toBeDefined();
});

it('retains an indexed song ID when it is renamed or its bytes are replaced in the same directory', async () => {
  const directory = path.join(root, 'new'); await mkdir(directory);
  const firstPath = path.join(directory, 'first.wav'); await writeFile(firstPath, bytes);
  await saveDirectory(directory);
  const initial = listTracks(db)[0]; updateTrack(db, initial.id, { isFavorite: true });
  const nextPath = path.join(directory, 'renamed.wav');
  await writeFile(nextPath, bytes); await rm(firstPath);
  await saveDirectory(directory);
  expect(getTrack(db, initial.id)).toMatchObject({ filePath: nextPath, isFavorite: true });
  bytes[bytes.length - 1] = 1; await writeFile(nextPath, bytes);
  await saveDirectory(directory);
  expect(listTracks(db)).toHaveLength(1);
  expect(getTrack(db, initial.id)?.fileHash).toBe(createHash('md5').update(bytes).digest('hex'));
});

it('rolls back the song index as well as preferences if committing settings fails', async () => {
  const directory = path.join(root, 'new'); await mkdir(directory); await writeFile(path.join(directory, 'new.wav'), bytes);
  setSetting(db, 'library_path', root);
  db.exec("CREATE TRIGGER refuse_library BEFORE INSERT ON settings WHEN NEW.key = 'library_path' BEGIN SELECT RAISE(ABORT, 'settings failed'); END");
  await expect(saveDirectory(directory)).rejects.toThrow('settings failed');
  expect(listTracks(db)).toHaveLength(0);
  expect(getSetting(db, 'library_path')).toBe(root);
  expect(getSetting(db, 'library_index_path')).toBeUndefined();
});

it('hides songs removed from disk after rescanning while keeping their favorites for recovery', async () => {
  const directory = path.join(root, 'new'); await mkdir(directory);
  const file = path.join(directory, 'song.wav'); await writeFile(file, bytes);
  await saveDirectory(directory);
  const initial = listTracks(db)[0]; updateTrack(db, initial.id, { isFavorite: true });
  await rm(file); await saveDirectory(directory);
  const service = createDatabaseLibraryService(db);
  expect(await service.getTracks(null)).toEqual([]);
  expect(await service.getGames()).toEqual([]);
  expect(getTrack(db, initial.id)?.isFavorite).toBe(true);
});

it('renames indexed games without moving their folder and preserves user covers', async () => {
  const directory = path.join(root, 'new'); const album = path.join(directory, 'ATRI');
  await mkdir(album, { recursive: true });
  const file = path.join(album, 'song.wav'); await writeFile(file, bytes);
  const exe = path.join(album, 'game.exe'); await writeFile(exe, 'program');
  const cover = path.join(album, 'cover.png'); await writeFile(cover, 'original cover');
  await saveDirectory(directory);
  const service = createDatabaseLibraryService(db); const track = listTracks(db)[0];
  await service.updateGame!(track.gameId, { coverPath: cover });
  await service.updateGame!(track.gameId, { name: 'Custom title', coverPath: null });
  expect(getTrack(db, track.id)?.filePath).toBe(file);
  expect(await readFile(exe, 'utf8')).toBe('program');
  expect(await readFile(cover, 'utf8')).toBe('original cover');
  expect((await service.getGames())[0].name).toBe('Custom title');
});

it('deletes only indexed audio and preserves programs, saves and previous-root playlist records', async () => {
  const oldRoot = path.join(root, 'old'); const newRoot = path.join(root, 'new');
  const oldAlbum = path.join(oldRoot, 'ATRI'); const album = path.join(newRoot, 'ATRI');
  await mkdir(oldAlbum, { recursive: true }); await mkdir(album, { recursive: true });
  const oldFile = path.join(oldAlbum, 'old.wav'); await writeFile(oldFile, bytes);
  await saveDirectory(oldRoot);
  const oldTrack = listTracks(db)[0]; updateTrack(db, oldTrack.id, { isFavorite: true });
  createPlaylist(db, { id: 'keep', name: 'Keep' }); addTrackToPlaylist(db, 'keep', oldTrack.id);
  bytes[bytes.length - 1] = 1;
  const file = path.join(album, 'song.wav'); await writeFile(file, bytes);
  await writeFile(path.join(album, 'game.exe'), 'program');
  await writeFile(path.join(album, 'save.dat'), 'save');
  await saveDirectory(newRoot);
  const service = createDatabaseLibraryService(db); const game = (await service.getGames())[0];
  await service.deleteGame!(game.id);
  expect(await readdir(album)).toEqual(['game.exe', 'save.dat']);
  expect(createHash('md5').update(await readFile(oldFile)).digest('hex')).toBe(oldTrack.fileHash);
  expect(getTrack(db, oldTrack.id)?.isFavorite).toBe(true);
  expect(listPlaylistTracks(db, 'keep')[0].id).toBe(oldTrack.id);
  expect(await service.getTracks(null)).toEqual([]);
});
