import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, existsSync } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SYNC_FORMAT, SYNC_VERSION, type SyncApplyResult, type SyncConflict, type SyncFile, type SyncGame, type SyncManifest, type SyncPreference } from '../../shared/library-sync';
import { sanitizeDirectoryName, assertWithin } from '../../shared/paths';
import { createGame, listGames, setGameCover } from '../database/queries/games';
import { getGameSources, upsertGameSource } from '../database/queries/game-sources';
import { addTrackToPlaylist, createPlaylist, listPlaylists, listPlaylistTracks } from '../database/queries/playlists';
import { insertTrack, listTracks, updateTrack } from '../database/queries/tracks';
import { isAudioFile } from './formats';
import { isWithinLibrary } from './library-directory';

export interface LibraryPackage { directory: string; manifest: SyncManifest; fingerprint: string }
const MAX_MANIFEST = 32 * 1024 * 1024;
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
function invalid(): never { throw new Error('同步包格式无效或文件已改变，请重新导出并选择同步包。'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, maximum = 1000): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) invalid();
}
function nullableString(value: unknown, maximum = 1000): void { if (value !== null) string(value, maximum); }
function array(value: unknown, limit: number): asserts value is unknown[] { if (!Array.isArray(value) || value.length > limit) invalid(); }
function uniqueIds(items: unknown[]): void {
  const ids = items.map(item => { const id = record(item).id; string(id, 128); return id; });
  if (new Set(ids).size !== ids.length) invalid();
}
function validateFile(value: unknown, image = false): asserts value is SyncFile {
  const file = record(value); string(file.path, 240); string(file.sha256, 64);
  if (!/^assets\/[a-f0-9-]+\.[a-z0-9]+$/u.test(file.path) || !/^[a-f0-9]{64}$/u.test(file.sha256)) invalid();
  if (!Number.isSafeInteger(file.size) || Number(file.size) < 0) invalid();
  if (image ? !imageExtensions.has(path.extname(file.path)) : !isAudioFile(file.path)) invalid();
}
function normalizeMetadataCache(value: unknown, source: string): string {
  const data = record(value);
  const text = (value: unknown, max = 100000): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > max) invalid();
    return value;
  };
  const strings = (value: unknown): string[] => {
    if (value === undefined) return [];
    array(value, 1000); return value.map(item => { string(item, 10000); return item; });
  };
  const number = (value: unknown): number | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) invalid();
    return value;
  };
  const url = (value: unknown): string | null => { const result = text(value, 4000); if (result && !/^https:\/\//u.test(result)) invalid(); return result; };
  const candidate = (value: unknown) => {
    const row = record(value); string(row.externalId, 128); string(row.title, 2000);
    const credits = (value: unknown, character: boolean) => {
      if (value === undefined) return [];
      array(value, 1000); return value.map(item => {
        const person = record(item); string(person.externalId, 128); string(person.name, 2000);
        return { externalId: person.externalId, name: person.name, originalName: text(person.originalName), role: text(person.role),
          imageUrl: url(person.imageUrl), sourceUrl: url(person.sourceUrl) ?? '',
          ...(character ? { description: text(person.description), voiceActors: strings(person.voiceActors) } : {}) };
      });
    };
    return { externalId: row.externalId, title: row.title, titleCn: text(row.titleCn), aliases: strings(row.aliases),
      developer: text(row.developer), summary: text(row.summary), score: number(row.score), rank: number(row.rank),
      imageUrl: url(row.imageUrl), sourceUrl: source === 'vndb' ? `https://vndb.org/${row.externalId}` : `https://bgm.tv/subject/${row.externalId}`,
      released: text(row.released), releaseDate: text(row.releaseDate), languages: strings(row.languages), platforms: strings(row.platforms), tags: strings(row.tags),
      characters: credits(row.characters, true), staff: credits(row.staff, false) };
  };
  if (data.candidates !== undefined) array(data.candidates, 20);
  return JSON.stringify({ matched: data.matched == null ? null : candidate(data.matched),
    candidates: (data.candidates as unknown[] | undefined ?? []).map(candidate), summaryZhCn: text(data.summaryZhCn),
    creditsLoaded: data.creditsLoaded === true, creditsError: text(data.creditsError) });
}
export function validateSyncManifest(value: unknown): SyncManifest {
  const manifest = record(value);
  if (manifest.format !== SYNC_FORMAT || manifest.version !== SYNC_VERSION) invalid();
  string(manifest.application, 100); string(manifest.createdAt, 100);
  array(manifest.games, 20_000); array(manifest.tracks, 200_000); array(manifest.playlists, 20_000);
  uniqueIds(manifest.games); uniqueIds(manifest.tracks); uniqueIds(manifest.playlists);
  const gameIds = new Set(manifest.games.map(item => record(item).id));
  const trackIds = new Set(manifest.tracks.map(item => record(item).id));
  for (const value of manifest.games) {
    const game = record(value); string(game.name, 500);
    if (game.cover !== null) validateFile(game.cover, true);
    if (![null, 'manual', 'vndb', 'bangumi'].includes(game.coverSource as string)) invalid();
    array(game.metadata, 2); const sources = new Set();
    for (const item of game.metadata) {
      const source = record(item);
      if (!['vndb', 'bangumi'].includes(String(source.source)) || sources.has(source.source)) invalid();
      sources.add(source.source); if (typeof source.queryName !== 'string' || source.queryName.length > 1000) invalid();
      if (!['pending', 'matched', 'no_match', 'failed', 'ambiguous'].includes(String(source.status))) invalid();
      if (![null, 'auto', 'manual'].includes(source.matchMethod as string)) invalid();
      nullableString(source.externalId, 128); nullableString(source.fetchedAt, 100); nullableString(source.confirmedAt, 100);
      nullableString(source.imageUrl, 4000); nullableString(source.dataJson, 2 * 1024 * 1024);
      if (source.imageUrl !== null && !/^https:\/\//u.test(String(source.imageUrl))) invalid();
      if (source.dataJson !== null) source.dataJson = normalizeMetadataCache(JSON.parse(String(source.dataJson)), String(source.source));
    }
  }
  for (const value of manifest.tracks) {
    const track = record(value); string(track.gameId, 128); string(track.fileName, 500); string(track.format, 12);
    if (!gameIds.has(track.gameId) || !isAudioFile(`track.${track.format}`)) invalid();
    nullableString(track.customName, 1000);
    if (track.duration !== null && (typeof track.duration !== 'number' || !Number.isFinite(track.duration) || track.duration < 0)) invalid();
    if (!['music', 'voice'].includes(String(track.kind)) || typeof track.isFavorite !== 'boolean') invalid();
    if (!Number.isSafeInteger(track.trackNumber) || Number(track.trackNumber) < 0) invalid();
    if (track.sourceMd5 !== undefined && (typeof track.sourceMd5 !== 'string' || !/^[a-f0-9]{32}$/u.test(track.sourceMd5))) invalid();
    validateFile(track.file);
    if (path.extname(track.file.path) !== `.${track.format.toLowerCase()}`) invalid();
  }
  for (const value of manifest.playlists) {
    const playlist = record(value); string(playlist.name, 500); array(playlist.trackIds, 200_000);
    if (new Set(playlist.trackIds).size !== playlist.trackIds.length || playlist.trackIds.some(id => !trackIds.has(id))) invalid();
  }
  return manifest as unknown as SyncManifest;
}
async function hashFile(filePath: string, algorithm = 'sha256'): Promise<string> {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
async function containedFile(directory: string, filePath: string): Promise<string> {
  const root = await realpath(directory); const resolved = await realpath(assertWithin(filePath, directory));
  assertWithin(resolved, root);
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) invalid();
  return resolved;
}
async function verifyFile(directory: string, file: SyncFile): Promise<string> {
  const resolved = await containedFile(directory, path.join(directory, file.path));
  if ((await lstat(resolved)).size !== file.size || await hashFile(resolved) !== file.sha256) invalid();
  return resolved;
}
export async function readLibraryPackage(manifestPath: string): Promise<LibraryPackage> {
  if ((await lstat(manifestPath)).size > MAX_MANIFEST) invalid();
  const directory = path.dirname(await realpath(manifestPath));
  const bytes = await readFile(manifestPath);
  if (bytes.length > MAX_MANIFEST) invalid();
  const manifest = validateSyncManifest(JSON.parse(bytes.toString('utf8')));
  return { directory, manifest, fingerprint: createHash('sha256').update(bytes).digest('hex') };
}
export async function exportLibraryPackage(db: Database.Database, libraryPath: string, targetDirectory: string, application: string) {
  const directory = path.join(await realpath(targetDirectory), `NatsumeSync-${randomUUID()}`);
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  let totalBytes = 0;
  try {
    const allTracks = listTracks(db);
    const tracks = allTracks.filter(track => isWithinLibrary(track.filePath, libraryPath));
    const games = listGames(db).filter(game => tracks.some(track => track.gameId === game.id) || !allTracks.some(track => track.gameId === game.id));
    const sources = new Map(games.map(game => [game.id, getGameSources(db, game.id)]));
    const playlists = listPlaylists(db).map(playlist => ({ id: playlist.id, name: playlist.name,
      trackIds: listPlaylistTracks(db, playlist.id).filter(track => tracks.some(item => item.id === track.id)).map(track => track.id) }));
    const copy = async (sourcePath: string): Promise<SyncFile> => {
      const source = await containedFile(libraryPath, sourcePath);
      const relative = `assets/${randomUUID()}${path.extname(source).toLowerCase()}`;
      const target = path.join(directory, relative);
      await copyFile(source, target, constants.COPYFILE_EXCL);
      const size = (await lstat(target)).size; totalBytes += size;
      return { path: relative, size, sha256: await hashFile(target) };
    };
    const manifest: SyncManifest = { format: SYNC_FORMAT, version: SYNC_VERSION, application, createdAt: new Date().toISOString(), games: [], tracks: [], playlists };
    for (const game of games) manifest.games.push({ id: game.id, name: game.name,
      cover: game.coverPath ? await copy(game.coverPath) : null, coverSource: game.coverSource,
      metadata: sources.get(game.id)!.map(row => ({ source: row.source, externalId: row.externalId, queryName: row.queryName,
        status: row.status, dataJson: row.dataJson, imageUrl: row.imageUrl, fetchedAt: row.fetchedAt,
        matchMethod: row.matchMethod, confirmedAt: row.confirmedAt })) });
    for (const track of tracks) manifest.tracks.push({ id: track.id, gameId: track.gameId, fileName: track.fileName,
      customName: track.customName, duration: track.duration, kind: track.kind, format: track.format.toLowerCase(),
      trackNumber: track.trackNumber, isFavorite: track.isFavorite,
      sourceMd5: /^[a-f0-9]{32}$/iu.test(track.fileHash) ? track.fileHash.toLowerCase() : undefined, file: await copy(track.filePath) });
    validateSyncManifest(manifest);
    const manifestPath = path.join(directory, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    return { manifestPath, tracks: tracks.length, totalBytes };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
function identity(game: SyncGame) { return game.metadata.filter(item => item.externalId && item.status === 'matched').map(item => `${item.source}:${item.externalId}`); }
async function planMerge(db: Database.Database, manifest: SyncManifest) {
  const games = listGames(db); const tracks = listTracks(db); const playlists = listPlaylists(db);
  const gameMap = new Map<string, string>(); const trackMap = new Map<string, string>(); const playlistMap = new Map<string, string>();
  for (const track of tracks) {
    if (!/^[a-f0-9]{64}$/u.test(track.fileHash) && existsSync(track.filePath)) track.fileHash = await hashFile(track.filePath);
  }
  const metadata = new Map(games.map(game => [game.id, getGameSources(db, game.id)]));
  const conflicts: SyncConflict[] = [];
  const plannedGames: SyncGame[] = [];
  for (const incoming of manifest.games) {
    const ids = identity(incoming);
    const existing = games.find(game => game.id === incoming.id)
      ?? games.find(game => metadata.get(game.id)!.some(source => source.externalId && ids.includes(`${source.source}:${source.externalId}`)))
      ?? games.find(game => game.name.normalize('NFKC').trim().toLocaleLowerCase() === incoming.name.normalize('NFKC').trim().toLocaleLowerCase());
    const earlier = plannedGames.find(game => identity(game).some(id => ids.includes(id)) || game.name.normalize('NFKC').trim().toLocaleLowerCase() === incoming.name.normalize('NFKC').trim().toLocaleLowerCase());
    gameMap.set(incoming.id, existing?.id ?? (earlier ? gameMap.get(earlier.id)! : incoming.id));
    plannedGames.push(incoming);
    if (existing) {
      if (Boolean(incoming.cover)) conflicts.push({ kind: 'game', name: incoming.name });
      for (const source of incoming.metadata) {
        const local = metadata.get(existing.id)!.find(item => item.source === source.source);
        if (local && (local.externalId !== source.externalId || local.dataJson !== source.dataJson || local.matchMethod !== source.matchMethod)) conflicts.push({ kind: 'metadata', name: `${incoming.name} · ${source.source}` });
      }
    }
  }
  const plannedTracks = new Map<string, string>();
  for (const incoming of manifest.tracks) {
    const gameId = gameMap.get(incoming.gameId)!;
    const existing = tracks.find(track => track.id === incoming.id && track.gameId === gameId && track.fileHash === incoming.file.sha256)
      ?? tracks.find(track => track.gameId === gameId && track.fileHash === incoming.file.sha256);
    const id = existing?.id ?? (tracks.some(track => track.id === incoming.id) ? randomUUID() : incoming.id);
    const logicalKey = `${gameId}:${incoming.file.sha256}`;
    trackMap.set(incoming.id, existing?.id ?? plannedTracks.get(logicalKey) ?? id);
    plannedTracks.set(logicalKey, trackMap.get(incoming.id)!);
    if (existing && (existing.customName !== incoming.customName || existing.isFavorite !== incoming.isFavorite || existing.trackNumber !== incoming.trackNumber || existing.kind !== incoming.kind || existing.duration !== incoming.duration)) conflicts.push({ kind: 'track', name: incoming.customName || incoming.fileName });
  }
  const plannedPlaylists = new Map<string, string>();
  for (const incoming of manifest.playlists) {
    const existing = playlists.find(item => item.id === incoming.id) ?? playlists.find(item => item.name === incoming.name);
    playlistMap.set(incoming.id, existing?.id ?? plannedPlaylists.get(incoming.name) ?? incoming.id);
    plannedPlaylists.set(incoming.name, playlistMap.get(incoming.id)!);
    if (existing && (existing.name !== incoming.name || JSON.stringify(listPlaylistTracks(db, existing.id).map(track => track.id)) !== JSON.stringify(incoming.trackIds.map(id => trackMap.get(id))))) conflicts.push({ kind: 'playlist', name: incoming.name });
  }
  return { games, tracks, playlists, gameMap, trackMap, playlistMap, conflicts };
}
export async function previewLibraryPackage(db: Database.Database, manifest: SyncManifest) {
  const plan = await planMerge(db, manifest);
  return { application: manifest.application, createdAt: manifest.createdAt, games: manifest.games.length, tracks: manifest.tracks.length,
    playlists: manifest.playlists.length, newGames: new Set(manifest.games.filter(game => !plan.games.some(local => local.id === plan.gameMap.get(game.id))).map(game => plan.gameMap.get(game.id))).size,
    newTracks: new Set(manifest.tracks.filter(track => !plan.tracks.some(local => local.id === plan.trackMap.get(track.id))).map(track => plan.trackMap.get(track.id))).size,
    newPlaylists: new Set(manifest.playlists.filter(playlist => !plan.playlists.some(local => local.id === plan.playlistMap.get(playlist.id))).map(playlist => plan.playlistMap.get(playlist.id))).size,
    totalBytes: manifest.tracks.reduce((sum, track) => sum + track.file.size, 0) + manifest.games.reduce((sum, game) => sum + (game.cover?.size ?? 0), 0),
    conflicts: plan.conflicts.slice(0, 100), conflictCount: plan.conflicts.length };
}
export async function applyLibraryPackage(db: Database.Database, libraryPath: string, pkg: LibraryPackage, preference: SyncPreference): Promise<SyncApplyResult> {
  const manifest = validateSyncManifest(pkg.manifest); const plan = await planMerge(db, manifest);
  await mkdir(libraryPath, { recursive: true }); const root = await realpath(libraryPath);
  const createdDirectories: string[] = []; const storage = new Map<string, string>();
  const localHashes = new Map<string, string>();
  const result: SyncApplyResult = { games: 0, tracks: 0, playlists: 0, updated: 0 };
  try {
    // Verify everything before copying or starting the SQLite transaction.
    const files = [...manifest.tracks.map(track => track.file), ...manifest.games.flatMap(game => game.cover ? [game.cover] : [])];
    for (const file of files) await verifyFile(pkg.directory, file);
    const folders = new Map<string, string>();
    const copy = async (gameId: string, file: SyncFile) => {
      const destinationId = plan.gameMap.get(gameId)!;
      let folder = folders.get(destinationId);
      if (!folder) {
        const game = plan.games.find(item => item.id === destinationId) ?? manifest.games.find(item => plan.gameMap.get(item.id) === destinationId)!;
        const gameFolder = assertWithin(path.join(root, sanitizeDirectoryName(game.name)), root);
        await mkdir(gameFolder, { recursive: true }); assertWithin(await realpath(gameFolder), root);
        folder = path.join(gameFolder, `.natsume-sync-${randomUUID()}`);
        await mkdir(folder); createdDirectories.push(folder); folders.set(destinationId, folder);
      }
      const source = await verifyFile(pkg.directory, file);
      const target = path.join(folder, `${randomUUID()}${path.extname(file.path)}`);
      await copyFile(source, target, constants.COPYFILE_EXCL);
      if (await hashFile(target) !== file.sha256) invalid();
      storage.set(file.path, target);
      localHashes.set(file.path, await hashFile(target, 'md5'));
    };
    for (const track of manifest.tracks) {
      const existing = plan.tracks.find(item => item.id === plan.trackMap.get(track.id));
      if (!existing || !existsSync(existing.filePath)) await copy(track.gameId, track.file);
    }
    for (const game of manifest.games) {
      const localCover = plan.games.find(item => item.id === plan.gameMap.get(game.id))?.coverPath;
      if (game.cover && (preference === 'incoming' || !localCover)) {
        if (!localCover || !existsSync(localCover) || await hashFile(localCover) !== game.cover.sha256) await copy(game.id, game.cover);
      }
    }
    db.transaction(() => {
      for (const game of manifest.games) {
        const id = plan.gameMap.get(game.id)!; const exists = Boolean(db.prepare('SELECT id FROM games WHERE id = ?').get(id));
        if (!exists) { createGame(db, { id, name: game.name }); result.games++; }
        // Existing names define managed directory locations and remain stable.
        const coverPath = game.cover && storage.get(game.cover.path);
        if (coverPath) { setGameCover(db, id, coverPath, game.coverSource); result.updated++; }
        for (const source of game.metadata) {
          const current = getGameSources(db, id).find(item => item.source === source.source);
          if (!current || preference === 'incoming') { upsertGameSource(db, { ...source, gameId: id, retryAfter: null, errorMessage: null }); result.updated++; }
        }
      }
      for (const track of manifest.tracks) {
        const id = plan.trackMap.get(track.id)!; const existing = db.prepare('SELECT id FROM tracks WHERE id = ?').get(id);
        if (!existing) {
          insertTrack(db, { ...track, id, gameId: plan.gameMap.get(track.gameId)!, filePath: storage.get(track.file.path)!, fileHash: track.sourceMd5 ?? localHashes.get(track.file.path)!, fileSize: track.file.size });
          updateTrack(db, id, { isFavorite: track.isFavorite }); result.tracks++;
        } else {
          const repaired = storage.get(track.file.path);
          if (repaired) db.prepare('UPDATE tracks SET file_path = ? WHERE id = ?').run(repaired, id);
          if (preference === 'incoming') { db.prepare('UPDATE tracks SET kind = ?, duration = ? WHERE id = ?').run(track.kind, track.duration, id); updateTrack(db, id, { customName: track.customName, isFavorite: track.isFavorite, trackNumber: track.trackNumber }); result.updated++; }
        }
      }
      for (const playlist of manifest.playlists) {
        const id = plan.playlistMap.get(playlist.id)!; const exists = Boolean(db.prepare('SELECT id FROM playlists WHERE id = ?').get(id));
        if (!exists) { createPlaylist(db, { id, name: playlist.name }); result.playlists++; }
        else if (preference === 'incoming') db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(playlist.name, id);
        // Merge membership; no remote removal can invalidate a local reference.
        for (const trackId of playlist.trackIds) addTrackToPlaylist(db, id, plan.trackMap.get(trackId)!);
      }
    })();
    return result;
  } catch (error) {
    await Promise.all(createdDirectories.map(directory => rm(directory, { recursive: true, force: true })));
    throw error;
  }
}
