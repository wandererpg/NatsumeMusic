import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/errors';
import type { GameUpdate, MetadataCandidate, MetadataSearchResult, MetadataSource } from '../../shared/types';
import { getGame, setGameCover } from '../database/queries/games';
import { getGameSource, upsertGameSource, type GameSourceRow } from '../database/queries/game-sources';
import type { NormalizedMetadataCandidate } from './game-metadata';

export interface PreparedMetadataUpdate {
  commit(): void;
  dispose(): Promise<void>;
  warning?: string;
}

interface SelectionDependencies {
  db: Database.Database;
  getLibraryPath(): string | Promise<string>;
  now(): Date;
  parse(row: GameSourceRow): { matched: NormalizedMetadataCandidate | null; candidates: NormalizedMetadataCandidate[] };
  search(source: MetadataSource, query: string, signal: AbortSignal): Promise<NormalizedMetadataCandidate[]>;
  lookup(source: MetadataSource, id: string, signal: AbortSignal): Promise<NormalizedMetadataCandidate>;
  download(url: string, directory: string, signal: AbortSignal): Promise<string>;
}

function metadataError(message: string): AppError { return new AppError('DB_ERROR', message, message); }

export function parseMetadataId(source: MetadataSource, input: string): string {
  let id = input.trim();
  if (/^https?:/i.test(id)) {
    let url: URL;
    try { url = new URL(id); } catch { throw metadataError('作品链接格式不正确。'); }
    const hosts = source === 'vndb' ? ['vndb.org', 'www.vndb.org'] : ['bgm.tv', 'bangumi.tv', 'chii.in'];
    const match = url.pathname.match(source === 'vndb' ? /^\/(v[1-9]\d*)\/?$/ : /^\/subject\/([1-9]\d*)\/?$/);
    if (!hosts.includes(url.hostname) || url.username || url.password || url.port || !match) {
      throw metadataError('请输入所选来源的官方作品链接。');
    }
    id = match[1];
  }
  if (!(source === 'vndb' ? /^v[1-9]\d*$/ : /^[1-9]\d*$/).test(id) || id.length > 24) {
    throw metadataError(source === 'vndb' ? 'VNDB ID 格式应为 v12345。' : 'Bangumi ID 应为正整数。');
  }
  return id;
}

export function createMetadataSelection(deps: SelectionDependencies) {
  // IDs are session-scoped, derived exclusively from main-process candidate data.
  const salt = randomUUID();
  const storedExtras = (row: GameSourceRow | undefined) => {
    try { const data = JSON.parse(row?.dataJson ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; }
  };
  const candidateId = (gameId: string, source: MetadataSource, revision: number, candidate: NormalizedMetadataCandidate) =>
    createHash('sha256').update(JSON.stringify([salt, gameId, source, revision, candidate.externalId,
      candidate.title, candidate.titleCn, candidate.aliases, candidate.developer, candidate.summary,
      candidate.score, candidate.rank, candidate.imageUrl, candidate.released ?? null])).digest('hex');
  const candidatesFor = (gameId: string, source: MetadataSource, revision: number, candidates: NormalizedMetadataCandidate[]): MetadataCandidate[] =>
    candidates.map(({ sourceUrl: _url, ...candidate }) => ({ ...candidate,
      candidateId: candidateId(gameId, source, revision, { ...candidate, sourceUrl: _url }) }));
  const requireGame = (gameId: string) => {
    const game = getGame(deps.db, gameId);
    if (!game) throw metadataError('找不到指定的作品，请重新打开音乐库。');
    return game;
  };
  const cachedSearch = async (gameId: string, source: MetadataSource, query: string, byId: boolean): Promise<MetadataSearchResult> => {
    const game = requireGame(gameId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const candidates = byId ? [await deps.lookup(source, parseMetadataId(source, query), controller.signal)]
        : await deps.search(source, query, controller.signal);
      controller.signal.throwIfAborted();
      requireGame(gameId);
      const previous = getGameSource(deps.db, gameId, source);
      const old = previous ? deps.parse(previous) : { matched: null, candidates: [] };
      const cache = byId ? [...candidates, ...old.candidates.filter(item => item.externalId !== candidates[0].externalId)].slice(0, 20) : candidates;
      const revision = previous?.revision ?? 0;
      upsertGameSource(deps.db, {
        gameId, source, externalId: previous?.externalId ?? null, queryName: query,
        status: previous?.status ?? 'pending', imageUrl: previous?.imageUrl ?? null,
        fetchedAt: previous?.fetchedAt ?? null, retryAfter: previous?.retryAfter ?? null,
        errorMessage: previous?.errorMessage ?? null,
        dataJson: JSON.stringify({ ...storedExtras(previous), matched: old.matched, candidates: cache }), revision,
        searchStatus: candidates.length ? 'ambiguous' : 'no_match', searchError: null, searchFetchedAt: deps.now().toISOString(),
      });
      return { source, queryName: query, revision, candidates: candidatesFor(gameId, source, revision, candidates) };
    } catch (error) {
      // Search errors never replace a confirmed identity or discard its cache.
      if (getGame(deps.db, game.id)) {
        const previous = getGameSource(deps.db, gameId, source);
        if (previous) upsertGameSource(deps.db, { ...previous, searchError: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    } finally { clearTimeout(timeout); }
  };

  const prepareUpdate = async (gameId: string, changes: GameUpdate): Promise<PreparedMetadataUpdate> => {
    requireGame(gameId);
    const selections = changes.metadataSelections ?? [];
    const selected = selections.map(selection => {
      const row = getGameSource(deps.db, gameId, selection.source);
      if ((row?.revision ?? 0) !== selection.expectedRevision) throw metadataError('资料已更新，请重新确认作品。');
      const candidate = row && deps.parse(row).candidates.find(item => candidateId(gameId, selection.source, row.revision, item) === selection.candidateId);
      if (!row || !candidate) throw metadataError('候选已失效，请重新搜索并选择作品。');
      return { row, candidate, revision: row.revision };
    });
    if (new Set(selections.map(selection => selection.source)).size !== selections.length) throw metadataError('每个来源只能选择一个作品。');
    const coverSource = changes.coverSelection;
    const coverRow = coverSource ? getGameSource(deps.db, gameId, coverSource) : undefined;
    const coverCandidate = coverSource ? selected.find(item => item.row.source === coverSource)?.candidate
      ?? (coverRow ? deps.parse(coverRow).matched : null) : null;
    if (coverSource && !coverCandidate?.imageUrl) throw metadataError('所选来源没有可用封面。');
    let coverPath: string | undefined;
    let coverDirectory: string | undefined;
    let warning: string | undefined;
    if (coverSource && coverCandidate?.imageUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const libraryPath = await deps.getLibraryPath();
        if (!libraryPath.trim()) throw new Error('请先设置音乐库目录。');
        coverDirectory = path.join(path.resolve(libraryPath), `.natsume-auto-cover-${randomUUID()}`);
        coverPath = await deps.download(coverCandidate.imageUrl, coverDirectory, controller.signal);
        controller.signal.throwIfAborted();
      } catch (error) {
        warning = `资料已保存，封面下载失败，已保留原封面：${error instanceof Error ? error.message : String(error)}。可再次选择该来源封面重试。`;
        if (coverDirectory) await rm(coverDirectory, { recursive: true, force: true });
        coverDirectory = undefined;
        coverPath = undefined;
      } finally { clearTimeout(timeout); }
    }
    const dispose = async () => { if (coverDirectory) await rm(coverDirectory, { recursive: true, force: true }); };
    return {
      warning, dispose,
      commit() {
        requireGame(gameId);
        for (const { row, revision } of selected) {
          if (getGameSource(deps.db, gameId, row.source)?.revision !== revision) throw metadataError('资料已更新，请重新确认作品。');
        }
        if (coverRow && !selected.some(item => item.row.source === coverSource)
          && getGameSource(deps.db, gameId, coverRow.source)?.revision !== coverRow.revision) throw metadataError('封面资料已更新，请重新确认。');
        for (const { row, candidate, revision } of selected) upsertGameSource(deps.db, {
          ...row, externalId: candidate.externalId, status: 'matched', matchMethod: 'manual',
          confirmedAt: deps.now().toISOString(), fetchedAt: deps.now().toISOString(), errorMessage: null,
          retryAfter: null, imageUrl: candidate.imageUrl, revision: revision + 1,
          dataJson: JSON.stringify({ ...(row.externalId === candidate.externalId ? storedExtras(row) : {}), matched: row.externalId === candidate.externalId ? { ...storedExtras(row).matched, ...candidate, ...(storedExtras(row).creditsLoaded ? { characters: storedExtras(row).matched?.characters ?? [], staff: storedExtras(row).matched?.staff ?? [] } : {}) } : candidate, candidates: deps.parse(row).candidates }),
        });
        if (coverPath && coverSource) setGameCover(deps.db, gameId, coverPath, coverSource);
      },
    };
  };

  return {
    candidatesFor, prepareUpdate,
    search: (gameId: string, source: MetadataSource, query: string) => cachedSearch(gameId, source, query, false),
    lookup: (gameId: string, source: MetadataSource, input: string) => cachedSearch(gameId, source, input, true),
  };
}
