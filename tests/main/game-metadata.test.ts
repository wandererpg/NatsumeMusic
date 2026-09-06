import Database from 'better-sqlite3';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame, setGameCover } from '../../src/main/database/queries/games';
import {
  createGameMetadataService,
  normalizeGameName,
  resolveCandidate,
  searchBangumi,
  searchVndb,
  type MetadataHttpClient,
  type NormalizedMetadataCandidate,
} from '../../src/main/services/game-metadata';
import { downloadCover } from '../../src/main/services/cover-download';

function candidate(overrides: Partial<NormalizedMetadataCandidate> = {}): NormalizedMetadataCandidate {
  return {
    externalId: 'v1',
    title: 'ATRI',
    titleCn: null,
    aliases: [],
    developer: null,
    summary: null,
    score: null,
    rank: null,
    imageUrl: null,
    sourceUrl: 'https://example.invalid/v1',
    ...overrides,
  };
}

interface FakeResponseOptions {
  status: number;
  contentType: string;
  body: Buffer;
}

function fakeResponse({ status, contentType, body }: FakeResponseOptions) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
    json: async () => JSON.parse(body.toString('utf8')) as unknown,
    text: async () => body.toString('utf8'),
    arrayBuffer: async (): Promise<ArrayBuffer> => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return fakeResponse({ status, contentType: 'application/json', body: Buffer.from(JSON.stringify(value)) });
}

function fixtureHttp(): MetadataHttpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(url);
      if (url === 'https://api.vndb.org/kana/vn') {
        return jsonResponse({ results: [{
          id: 'v17',
          title: 'ATRI',
          alttitle: 'ATRI -My Dear Moments-',
          aliases: ['ATRI'],
          description: 'A story.',
          rating: 8.5,
          rank: 17,
          image: { url: 'https://img.example/atari.jpg' },
          developers: [{ name: 'Frontwing' }],
        }] });
      }
      if (url === 'https://api.bgm.tv/v0/search/subjects') {
        return jsonResponse({ data: [{ id: 100, name: 'ATRI', name_cn: 'ATRI', type: 4, score: 8.4, rank: 18 }] });
      }
      if (url === 'https://api.bgm.tv/v0/subjects/100') {
        return jsonResponse({
          id: 100,
          name: 'ATRI',
          name_cn: 'ATRI',
          summary: 'A story.',
          score: 8.4,
          rank: 18,
          images: { large: 'https://img.example/atari-bgm.jpg' },
          infobox: [{ key: '开发商', value: [{ v: 'Frontwing' }] }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  };
}

describe('game metadata matching', () => {
  it('normalizes release markers without changing the display name', () => {
    expect(normalizeGameName('家族計画 ～追憶～ [PC][汉化版] v1.2')).toBe('家族計画 ～追憶～');
  });

  it('accepts an exact alias and treats an unrelated result as ambiguous', () => {
    const candidates = [
      candidate({ externalId: 'v1', title: 'Another Game', aliases: ['家族計画 ～追憶～'] }),
      candidate({ externalId: 'v2', title: 'Unrelated Game', aliases: [] }),
    ];
    expect(resolveCandidate('家族計画 ～追憶～', candidates)).toMatchObject({ status: 'matched', matched: { externalId: 'v1' } });
    expect(resolveCandidate('完全不存在', candidates).status).toBe('ambiguous');
    expect(resolveCandidate('完全不存在', []).status).toBe('no_match');
  });

  it('matches a known edition suffix to a base title when a source omits the edition', () => {
    const result = resolveCandidate('家族計画 ～追憶～', [
      candidate({ externalId: 'base', title: '家族計画', imageUrl: 'https://img.example/family.jpg' }),
    ]);
    expect(result).toMatchObject({ status: 'matched', matched: { externalId: 'base' } });
  });

  it('marks close exact candidates ambiguous instead of choosing a cover', () => {
    const result = resolveCandidate('ATRI', [
      candidate({ externalId: 'v1', title: 'ATRI' }),
      candidate({ externalId: 'v2', title: 'ATRI' }),
    ]);
    expect(result.status).toBe('ambiguous');
    expect(result.matched).toBeNull();
  });

  it('normalizes the official VNDB response into a safe candidate', async () => {
    const http = fixtureHttp();
    const [result] = await searchVndb('ATRI', new AbortController().signal, http);
    expect(result).toMatchObject({ externalId: 'v17', title: 'ATRI', developer: 'Frontwing', imageUrl: 'https://img.example/atari.jpg' });
  });

  it('does not request fields that the current VNDB API no longer exposes', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const http: MetadataHttpClient = {
      fetch: async (_url, init) => {
        requestBody = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
        return jsonResponse({ results: [] });
      },
    };

    await searchVndb('ATRI', new AbortController().signal, http);

    expect(requestBody).not.toBeNull();
    expect(String((requestBody as unknown as Record<string, unknown>).fields).split(',')).not.toContain('rank');
  });

  it('keeps the upstream error body so the import result explains why lookup failed', async () => {
    const http: MetadataHttpClient = {
      fetch: async () => fakeResponse({
        status: 400,
        contentType: 'application/json',
        body: Buffer.from('{"error":"rank is not a valid field"}'),
      }),
    };

    await expect(searchVndb('ATRI', new AbortController().signal, http))
      .rejects.toThrow('rank is not a valid field');
  });

  it('searches Bangumi games and reads the detail for the top result', async () => {
    const http = fixtureHttp();
    const [result] = await searchBangumi('ATRI', new AbortController().signal, http);
    expect(result).toMatchObject({ externalId: '100', title: 'ATRI', developer: 'Frontwing', imageUrl: 'https://img.example/atari-bgm.jpg' });
    expect(http.calls).toContain('https://api.bgm.tv/v0/subjects/100');
  });

  it('upgrades Bangumi HTTP image URLs before local HTTPS-only download', async () => {
    const http: MetadataHttpClient = {
      fetch: async (url) => {
        if (url === 'https://api.bgm.tv/v0/search/subjects') {
          return jsonResponse({ data: [{ id: 200, name: '家族計画', type: 4 }] });
        }
        return jsonResponse({
          id: 200,
          name: '家族計画',
          images: { large: 'http://lain.bgm.tv/pic/cover/l/family.jpg' },
        });
      },
    };
    const [result] = await searchBangumi('家族計画', new AbortController().signal, http);
    expect(result?.imageUrl).toBe('https://lain.bgm.tv/pic/cover/l/family.jpg');
  });
});

describe('cover download safety', () => {
  it('downloads an image through a temporary file and returns a local cover path', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'natsume-cover-'));
    try {
      const body = Buffer.from('jpeg');
      const response = fakeResponse({ status: 200, contentType: 'image/jpeg', body });
      await expect(downloadCover(
        'https://img.example/cover',
        target,
        new AbortController().signal,
        { fetch: async () => response },
      )).resolves.toBe(path.join(target, '.cover.jpg'));
      await expect(readFile(path.join(target, '.cover.jpg'))).resolves.toEqual(body);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('rejects non-image responses without leaving a temporary file', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'natsume-cover-'));
    try {
      await expect(downloadCover(
        'https://img.example/html',
        target,
        new AbortController().signal,
        { fetch: async () => fakeResponse({ status: 200, contentType: 'text/html', body: Buffer.from('x') }) },
      )).rejects.toThrow();
      await expect(readdir(target)).resolves.toEqual([]);
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });

  it('rejects oversized image bodies', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'natsume-cover-'));
    try {
      await expect(downloadCover(
        'https://img.example/huge',
        target,
        new AbortController().signal,
        { fetch: async () => fakeResponse({ status: 200, contentType: 'image/png', body: Buffer.alloc(8 * 1024 * 1024 + 1) }) },
      )).rejects.toThrow();
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});

describe('metadata migration fixture', () => {
  it('keeps the metadata test database on the current schema', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    db.close();
  });

  it('queries each source once and reuses the game-level cache', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'natsume-metadata-'));
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    await mkdir(path.join(library, 'ATRI'), { recursive: true });
    const http = fixtureHttp();
    const localCover = path.join(library, 'ATRI', '.cover.jpg');
    const service = createGameMetadataService({
      db,
      getLibraryPath: () => library,
      http,
      download: async () => {
        await writeFile(localCover, 'cover');
        return localCover;
      },
    });
    try {
      await service.ensure('g1', { signal: new AbortController().signal });
      await service.ensure('g1', { signal: new AbortController().signal });
      expect(http.calls.filter((url) => url.includes('/kana/vn') || url.includes('/search/subjects'))).toHaveLength(2);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not replace a manually selected cover', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'natsume-metadata-manual-'));
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    await mkdir(path.join(library, 'ATRI'), { recursive: true });
    const manualCover = path.join(library, 'ATRI', '.cover-manual.jpg');
    await writeFile(manualCover, 'manual');
    setGameCover(db, 'g1', manualCover);
    const service = createGameMetadataService({ db, getLibraryPath: () => library, http: fixtureHttp(), download: async () => { throw new Error('must not download'); } });
    try {
      await service.ensure('g1', { signal: new AbortController().signal });
      expect((await import('../../src/main/database/queries/games')).getGame(db, 'g1')?.coverPath).toBe(manualCover);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('caches a source failure until retry_after and force refresh bypasses it', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'natsume-metadata-retry-'));
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    await mkdir(path.join(library, 'ATRI'), { recursive: true });
    const base = fixtureHttp();
    let vndbCalls = 0;
    const http: MetadataHttpClient & { calls: string[] } = {
      calls: base.calls,
      fetch: async (url, init) => {
        if (url.includes('/kana/vn')) {
          vndbCalls += 1;
          throw new Error('offline');
        }
        return base.fetch(url, init);
      },
    };
    let current = new Date('2026-08-24T00:00:00.000Z');
    const service = createGameMetadataService({
      db,
      getLibraryPath: () => library,
      http,
      now: () => current,
      download: async () => path.join(library, 'ATRI', '.cover.jpg'),
    });
    try {
      await service.ensure('g1', { signal: new AbortController().signal });
      await service.ensure('g1', { signal: new AbortController().signal });
      expect(vndbCalls).toBe(1);
      current = new Date('2026-08-24T00:31:00.000Z');
      await service.ensure('g1', { signal: new AbortController().signal });
      expect(vndbCalls).toBe(2);
      await service.refresh('g1');
      expect(vndbCalls).toBe(3);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
