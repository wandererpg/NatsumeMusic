import Database from 'better-sqlite3';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { createGame, getGame, renameGame, setGameCover } from '../../src/main/database/queries/games';
import { createGameMetadataService, searchBangumi, type MetadataHttpClient } from '../../src/main/services/game-metadata';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const json = (value: unknown) => ({ ok: true, status: 200, headers: { get: () => 'application/json' },
  json: async () => value, arrayBuffer: async () => new ArrayBuffer(0) });
function fixture() {
  const db = new Database(':memory:'); databases.push(db); migrate(db);
  createGame(db, { id: 'g1', name: 'Same title' });
  createGame(db, { id: 'g2', name: 'Other game' });
  const requests: Array<{ url: string; body: string }> = [];
  const http: MetadataHttpClient = { fetch: async (url, init) => {
    requests.push({ url, body: init?.body ?? '' });
    if (url.includes('/kana/vn')) {
      const filters = JSON.parse(init?.body ?? '{}').filters;
      const ids = filters?.[0] === 'id' ? [filters[2]] : ['v1', 'v2'];
      return json({ results: ids.map((id: string) => ({ id, title: 'Same title', description: `Details ${id}` })) });
    }
    return json({ data: [] });
  } };
  const service = createGameMetadataService({ db, http, getLibraryPath: () => '' });
  return { db, service, http, requests };
}

describe('manual metadata selection', () => {
  it('retains the game lock until both sources settle after cancellation', async () => {
    const { db } = fixture();
    let resolveLate!: (value: ReturnType<typeof json>) => void;
    const service = createGameMetadataService({ db, getLibraryPath: () => '', http: {
      fetch: (url, init) => url.includes('/kana/vn')
        ? new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true }))
        : new Promise(resolve => { resolveLate = resolve; }),
    } });
    const controller = new AbortController();
    const pending = service.ensure('g1', { signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await new Promise(done => setTimeout(done, 0));
    controller.abort();
    let acquired = false;
    const queued = service.withGameLock('g1', async () => { acquired = true; });
    await new Promise(done => setTimeout(done, 0));
    expect(acquired).toBe(false);
    resolveLate(json({ data: [] }));
    await rejected; await queued;
    expect(acquired).toBe(true);
    expect(db.prepare('SELECT * FROM game_sources WHERE game_id = ?').all('g1')).toEqual([]);
  });
  it('records an independent source timeout while keeping the other source usable', async () => {
    const { db } = fixture();
    const service = createGameMetadataService({ db, getLibraryPath: () => '', http: { fetch: async url => {
      if (url.includes('/kana/vn')) throw Object.assign(new Error('source timed out'), { name: 'AbortError' });
      return json({ data: [] });
    } } });
    const result = await service.ensure('g1', { signal: new AbortController().signal });
    expect(result.sources[0]).toMatchObject({ status: 'failed', errorMessage: 'source timed out' });
    expect(result.sources[1]).toMatchObject({ status: 'no_match' });
  });
  it('saves identity, preserves a manual cover and cleans a failed download', async () => {
    const { db } = fixture();
    const root = await mkdtemp(path.join(os.tmpdir(), 'metadata-cover-failure-'));
    const original = path.join(root, 'user-cover.jpg');
    await writeFile(original, 'original');
    setGameCover(db, 'g1', original);
    const service = createGameMetadataService({ db, getLibraryPath: () => root,
      http: { fetch: async url => url.includes('/kana/vn') ? json({ results: [{ id: 'v2', title: 'Chosen', image: { url: 'https://images.example/cover.jpg' } }] }) : json({ data: [] }) },
      download: async (_url, directory) => { await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'partial'), 'partial'); throw new Error('offline'); },
    });
    try {
      const results = await service.search('g1', 'vndb', 'Chosen');
      const prepared = await service.prepareUpdate('g1', { coverSelection: 'vndb', metadataSelections: [{ source: 'vndb', candidateId: results.candidates[0].candidateId, expectedRevision: results.revision }] });
      expect(prepared.warning).toContain('offline');
      db.transaction(() => prepared.commit())();
      expect(service.getSummary('g1').sources[0]).toMatchObject({ externalId: 'v2', matchMethod: 'manual' });
      expect(getGame(db, 'g1')).toMatchObject({ coverPath: original, coverSource: 'manual' });
      expect(await readdir(root)).toEqual(['user-cover.jpg']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('refuses a prepared selection after another selection has been saved', async () => {
    const { service, db } = fixture();
    const results = await service.search('g1', 'vndb', 'Same title');
    const prepare = (index: number) => service.prepareUpdate('g1', { metadataSelections: [{ source: 'vndb', candidateId: results.candidates[index].candidateId, expectedRevision: results.revision }] });
    const first = await prepare(0); const second = await prepare(1);
    db.transaction(() => second.commit())();
    expect(() => db.transaction(() => first.commit())()).toThrow(/重新确认/);
    expect(service.getSummary('g1').sources[0].externalId).toBe('v2');
  });
  it('does not recreate metadata when a game is deleted during a search', async () => {
    const { db } = fixture();
    let resolve!: (value: ReturnType<typeof json>) => void;
    const service = createGameMetadataService({ db, getLibraryPath: () => '', http: { fetch: () => new Promise(done => { resolve = done; }) } });
    const pending = service.search('g1', 'vndb', 'Same title');
    const rejected = expect(pending).rejects.toThrow();
    await new Promise(done => setTimeout(done, 0));
    db.prepare('DELETE FROM games WHERE id = ?').run('g1');
    resolve(json({ results: [{ id: 'v1', title: 'Same title' }] }));
    await rejected;
    expect(db.prepare('SELECT * FROM game_sources WHERE game_id = ?').all('g1')).toEqual([]);
  });
  it('exposes ambiguous candidates and persists the second choice across a new service instance', async () => {
    const { db, service, http } = fixture();
    const metadata = await service.ensure('g1', { signal: new AbortController().signal });
    const source = metadata.sources[0];
    expect(source.status).toBe('ambiguous');
    expect(source.candidates).toHaveLength(2);
    const prepared = await service.prepareUpdate('g1', { metadataSelections: [{ source: 'vndb',
      candidateId: source.candidates![1].candidateId, expectedRevision: source.revision! }] });
    db.transaction(() => prepared.commit())();
    const reopened = createGameMetadataService({ db, http, getLibraryPath: () => '' }).getSummary('g1');
    expect(reopened.sources[0]).toMatchObject({ status: 'matched', externalId: 'v2', matchMethod: 'manual' });
    expect(reopened.sources[0].confirmedAt).toBeTruthy();
    expect(getGame(db, 'g1')!.name).toBe('Same title');
  });

  it('searching different words changes candidates without committing a selection or renaming a game', async () => {
    const { service, db } = fixture();
    await service.ensure('g1', { signal: new AbortController().signal });
    const before = service.getSummary('g1').sources[0];
    const results = await service.search('g1', 'vndb', 'different words');
    expect(results.candidates).toHaveLength(2);
    const after = service.getSummary('g1').sources[0];
    expect(after.externalId).toBe(before.externalId);
    expect(after.revision).toBe(before.revision);
    expect(getGame(db, 'g1')!.name).toBe('Same title');
  });

  it('refreshes a manual binding by ID after a local rename and keeps it on network failure', async () => {
    const { service, db, requests } = fixture();
    const result = await service.search('g1', 'vndb', 'Same title');
    const prepared = await service.prepareUpdate('g1', { metadataSelections: [{ source: 'vndb',
      candidateId: result.candidates[1].candidateId, expectedRevision: result.revision }] });
    prepared.commit();
    renameGame(db, 'g1', 'Completely renamed');
    await service.refresh('g1');
    expect(requests.some(request => request.body.includes('"id","=","v2"'))).toBe(true);
    expect(service.getSummary('g1').sources[0]).toMatchObject({ externalId: 'v2', matchMethod: 'manual', status: 'matched' });
    const offline = createGameMetadataService({ db, getLibraryPath: () => '', http: { fetch: async () => { throw new Error('offline'); } } });
    expect((await offline.refresh('g1')).sources[0]).toMatchObject({ externalId: 'v2', status: 'matched', errorMessage: 'offline' });
  });

  it('rejects a candidate issued for a different game and a stale binding revision', async () => {
    const { service } = fixture();
    const result = await service.search('g1', 'vndb', 'Same title');
    const selection = { source: 'vndb' as const, candidateId: result.candidates[0].candidateId, expectedRevision: result.revision };
    await expect(service.prepareUpdate('g2', { metadataSelections: [selection] })).rejects.toThrow();
    const prepared = await service.prepareUpdate('g1', { metadataSelections: [selection] }); prepared.commit();
    await expect(service.prepareUpdate('g1', { metadataSelections: [selection] })).rejects.toThrow(/重新确认/);
  });

  it('allows official ID lookup and refuses arbitrary URL hosts', async () => {
    const { service } = fixture();
    const result = await service.lookup('g1', 'vndb', 'https://vndb.org/v2');
    expect(result.candidates[0].externalId).toBe('v2');
    await expect(service.lookup('g1', 'vndb', 'https://example.org/v2')).rejects.toThrow();
  });

  it('keeps every valid Bangumi result, including the fourth result', async () => {
    const http: MetadataHttpClient = { fetch: async url => url.includes('/search/')
      ? json({ data: [1, 2, 3, 4, 5].map(id => ({ id, name: `Game ${id}`, images: { common: `https://img.example/${id}.jpg` } })) })
      : json({ id: Number(url.split('/').pop()), name: `Game ${url.split('/').pop()}` }) };
    const candidates = await searchBangumi('Game', new AbortController().signal, http);
    expect(candidates.map(candidate => candidate.externalId)).toEqual(['1', '2', '3', '4', '5']);
  });
});
