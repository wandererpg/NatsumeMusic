import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { createGame, listGames } from '../../src/main/database/queries/games';
import { insertTrack as createTrack, listTracks, updateTrack, findTrackByHash } from '../../src/main/database/queries/tracks';
import { createPlaylist, addTrackToPlaylist, listPlaylistTracks } from '../../src/main/database/queries/playlists';
import { upsertGameSource, getGameSources } from '../../src/main/database/queries/game-sources';
import { exportLibraryPackage, readLibraryPackage, previewLibraryPackage, applyLibraryPackage } from '../../src/main/services/library-sync';

const roots: string[] = [];
const databases: Database.Database[] = [];
afterEach(async () => { databases.splice(0).forEach(db => db.close()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'natsume-sync-')); roots.push(root);
  const db = new Database(':memory:'); migrate(db); databases.push(db);
  const library = path.join(root, '音乐库'); await mkdir(library);
  return { root, db, library };
}
async function populated() {
  const f = await fixture(); const audio = path.join(f.library, '序曲.ogg'); await writeFile(audio, 'OggS music');
  createGame(f.db, { id: 'game-source', name: '素晴日' });
  createTrack(f.db, { id: 'track-source', gameId: 'game-source', filePath: audio, fileName: '序曲.ogg', format: 'ogg', fileSize: 10, fileHash: 'old-hash' });
  updateTrack(f.db, 'track-source', { customName: '喜欢的旋律', isFavorite: true });
  createPlaylist(f.db, { id: 'list-source', name: '最爱' }); addTrackToPlaylist(f.db, 'list-source', 'track-source');
  upsertGameSource(f.db, { gameId: 'game-source', source: 'vndb', externalId: 'v17', queryName: '素晴日', status: 'matched', dataJson: JSON.stringify({ matched: { externalId: 'v17', title: '素晴日' }, summaryZhCn: '简介' }), imageUrl: null, fetchedAt: null, retryAfter: null, errorMessage: null, matchMethod: 'manual', confirmedAt: '2026-10-19' });
  return f;
}

it('exports, previews without writes, merges and reimports idempotently', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeMusic');
  const pkg = await readLibraryPackage(exported.manifestPath);
  const before = dest.db.prepare('SELECT total_changes() AS n').get();
  expect((await previewLibraryPackage(dest.db, pkg.manifest)).newTracks).toBe(1);
  expect(dest.db.prepare('SELECT total_changes() AS n').get()).toEqual(before);
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  const [track] = listTracks(dest.db);
  expect(track).toMatchObject({ customName: '喜欢的旋律', isFavorite: true });
  expect(await readFile(track.filePath, 'utf8')).toBe('OggS music');
  const localHash = createHash('md5').update('OggS music').digest('hex');
  expect(track.fileHash).toBe(localHash);
  expect(findTrackByHash(dest.db, localHash)?.id).toBe(track.id);
  expect(getGameSources(dest.db, track.gameId)[0]).toMatchObject({ externalId: 'v17', matchMethod: 'manual' });
  expect(listPlaylistTracks(dest.db, 'list-source')).toHaveLength(1);
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  expect(listGames(dest.db)).toHaveLength(1); expect(listTracks(dest.db)).toHaveLength(1);
  expect(listPlaylistTracks(dest.db, 'list-source')).toHaveLength(1);
});

it('keeps existing game and track IDs while applying an explicitly chosen incoming favorite/name', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeNote');
  const pkg = await readLibraryPackage(exported.manifestPath);
  createGame(dest.db, { id: 'local-game', name: '素晴日' });
  const existing = path.join(dest.library, 'local.ogg'); await writeFile(existing, 'OggS music');
  createTrack(dest.db, { id: 'local-track', gameId: 'local-game', filePath: existing, fileName: 'local.ogg', format: 'ogg', fileSize: 10, fileHash: pkg.manifest.tracks[0].file.sha256 });
  expect((await previewLibraryPackage(dest.db, pkg.manifest)).conflictCount).toBeGreaterThan(0);
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  expect(listTracks(dest.db)[0]).toMatchObject({ id: 'local-track', isFavorite: false });
  await applyLibraryPackage(dest.db, dest.library, pkg, 'incoming');
  expect(listTracks(dest.db)[0]).toMatchObject({ id: 'local-track', gameId: 'local-game', isFavorite: true, customName: '喜欢的旋律' });
});

it('rejects traversal paths and modified package files without changing the destination', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeMusic');
  const pkg = await readLibraryPackage(exported.manifestPath);
  await writeFile(path.join(pkg.directory, pkg.manifest.tracks[0].file.path), 'corrupted');
  await expect(applyLibraryPackage(dest.db, dest.library, pkg, 'incoming')).rejects.toThrow();
  expect(listGames(dest.db)).toHaveLength(0);
  const invalid = { ...pkg.manifest, tracks: [{ ...pkg.manifest.tracks[0], file: { ...pkg.manifest.tracks[0].file, path: '../secret.ogg' } }] };
  await writeFile(exported.manifestPath, JSON.stringify(invalid));
  await expect(readLibraryPackage(exported.manifestPath)).rejects.toThrow();
});


it('merges duplicate logical items inside one package and preserves rich metadata', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeNote');
  const pkg = await readLibraryPackage(exported.manifestPath);
  pkg.manifest.games.push({ ...pkg.manifest.games[0], id: 'alias-game' });
  pkg.manifest.tracks.push({ ...pkg.manifest.tracks[0], id: 'alias-track', gameId: 'alias-game' });
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  expect(listGames(dest.db)).toHaveLength(1); expect(listTracks(dest.db)).toHaveLength(1);
  expect(JSON.parse(getGameSources(dest.db, listGames(dest.db)[0].id)[0].dataJson!)).toMatchObject({ summaryZhCn: '简介' });
});
it('updates incoming duration and classification and detects invalid nested metadata', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeNote');
  const pkg = await readLibraryPackage(exported.manifestPath);
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  pkg.manifest.tracks[0].kind = 'voice'; pkg.manifest.tracks[0].duration = 75;
  expect((await previewLibraryPackage(dest.db, pkg.manifest)).conflicts).toContainEqual({ kind: 'track', name: '喜欢的旋律' });
  await applyLibraryPackage(dest.db, dest.library, pkg, 'incoming');
  expect(listTracks(dest.db)[0]).toMatchObject({ kind: 'voice', duration: 75 });
  pkg.manifest.games[0].metadata[0].dataJson = JSON.stringify({ matched: { externalId: 'v17', title: 'bad', score: 'bad' } });
  await expect(applyLibraryPackage(dest.db, dest.library, pkg, 'incoming')).rejects.toThrow();
  expect(listTracks(dest.db)).toHaveLength(1);
});
it('rolls back database rows and copied files if a write fails', async () => {
  const source = await populated(); const dest = await fixture();
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeMusic');
  const pkg = await readLibraryPackage(exported.manifestPath);
  dest.db.exec("CREATE TRIGGER reject_sync BEFORE INSERT ON tracks BEGIN SELECT RAISE(ABORT, 'blocked'); END");
  await expect(applyLibraryPackage(dest.db, dest.library, pkg, 'local')).rejects.toThrow('blocked');
  expect(listGames(dest.db)).toHaveLength(0); expect(listTracks(dest.db)).toHaveLength(0);
  const { readdir } = await import('node:fs/promises');
  expect(await readdir(path.join(dest.library, '素晴日'))).toEqual([]);
});

it('preserves source MD5 for converted audio across both directions and validates it', async () => {
  const source = await populated(); const dest = await fixture(); const third = await fixture();
  // Importers record the original NWA/OWP bytes even when stored audio is WAV/OGG.
  const sourceMd5 = createHash('md5').update('original encoded game audio').digest('hex');
  source.db.prepare('UPDATE tracks SET file_hash = ?').run(sourceMd5);
  const exported = await exportLibraryPackage(source.db, source.library, source.root, 'NatsumeMusic');
  const pkg = await readLibraryPackage(exported.manifestPath);
  expect(pkg.manifest.tracks[0].sourceMd5).toBe(sourceMd5);
  await applyLibraryPackage(dest.db, dest.library, pkg, 'local');
  expect(findTrackByHash(dest.db, sourceMd5)?.id).toBe('track-source');
  const returned = await exportLibraryPackage(dest.db, dest.library, dest.root, 'NatsumeNote');
  const returnedPackage = await readLibraryPackage(returned.manifestPath);
  expect((await previewLibraryPackage(source.db, returnedPackage.manifest)).newTracks).toBe(0);
  await applyLibraryPackage(third.db, third.library, returnedPackage, 'local');
  expect(findTrackByHash(third.db, sourceMd5)?.id).toBe('track-source');
  pkg.manifest.tracks[0].sourceMd5 = 'invalid';
  await expect(applyLibraryPackage(third.db, third.library, pkg, 'local')).rejects.toThrow();
});
