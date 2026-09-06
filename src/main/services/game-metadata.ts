import type Database from 'better-sqlite3';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';

import { getGame, setGameCover } from '../database/queries/games';
import { getGameSource, getGameSources, upsertGameSource, type GameSourceInput, type GameSourceRow } from '../database/queries/game-sources';
import type { CoverSource, GameMetadataSourceSummary, GameMetadataSummary, MetadataSource, MetadataStatus } from '../../shared/types';
import { assertWithin, sanitizeDirectoryName } from '../../shared/paths';
import { downloadCover, type CoverHttpClient } from './cover-download';

export interface MetadataHttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface MetadataHttpClient {
  fetch(
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<MetadataHttpResponse>;
}

export interface NormalizedMetadataCandidate {
  externalId: string;
  title: string;
  titleCn: string | null;
  aliases: string[];
  developer: string | null;
  summary: string | null;
  score: number | null;
  rank: number | null;
  imageUrl: string | null;
  sourceUrl: string;
}

export interface CandidateResolution {
  status: 'matched' | 'no_match' | 'ambiguous';
  matched: NormalizedMetadataCandidate | null;
  candidates: NormalizedMetadataCandidate[];
}

const SOURCE_ORDER: MetadataSource[] = ['vndb', 'bangumi'];
const SOURCE_RETRY_MINUTES = 30;
const REQUEST_TIMEOUT_MS = 12_000;
const APPLICATION_USER_AGENT = 'NatsumeMusic/0.1.0';

/** Normalize only search/matching input; the display name remains unchanged. */
export function normalizeGameName(input: string): string {
  const trimmed = input.trim();
  const withoutMarkers = trimmed
    .replace(/\[(?:[^\]]*(?:pc|windows|汉化|汉化版|语音|语音版|修正|修正版)[^\]]*)\]/giu, '')
    .replace(/(?:汉化版|语音版|修正版)/giu, '')
    .replace(/\s+(?:v|ver(?:sion)?\.?)[\s_-]*\d+(?:\.\d+)*\s*$/iu, '')
    .replace(/\.(?:zip|7z|rar)$/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return withoutMarkers || trimmed;
}

function comparable(input: string): string {
  return normalizeGameName(input).normalize('NFKC').toLocaleLowerCase().replace(/[\s\u3000]+/gu, '');
}

/** Editions such as 家族計画 ～追憶～ are often indexed under their base title. */
function comparableEditionBase(input: string): string {
  return comparable(input).replace(/(?:~|～|〜)(?:追憶|絆箱|心の絆|再開|廉価版|廉价版)(?:~|～|〜)$/u, '');
}

function candidateTitles(item: NormalizedMetadataCandidate): string[] {
  return [item.title, item.titleCn ?? '', ...item.aliases].filter(Boolean);
}

function candidateScore(query: string, item: NormalizedMetadataCandidate): number {
  const normalizedQuery = comparable(query);
  const titles = candidateTitles(item).map(comparable);
  if (titles.some((title) => title === normalizedQuery)) {
    const mainTitle = comparable(item.title);
    return mainTitle === normalizedQuery ? 100 : 92;
  }
  const baseQuery = comparableEditionBase(query);
  if (baseQuery !== normalizedQuery && candidateTitles(item).some((title) => comparableEditionBase(title) === baseQuery)) {
    return 94;
  }
  if (titles.some((title) => title.includes(normalizedQuery) || normalizedQuery.includes(title))) {
    return 70;
  }
  const apiRankBonus = item.rank && item.rank > 0 ? Math.max(0, 10 - Math.min(10, item.rank)) : 0;
  return 40 + apiRankBonus;
}

export function resolveCandidate(query: string, candidates: NormalizedMetadataCandidate[]): CandidateResolution {
  if (candidates.length === 0) {
    return { status: 'no_match', matched: null, candidates: [] };
  }
  const ranked = candidates
    .map((item, index) => ({ item, score: candidateScore(query, item), index }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
  const topScore = candidateScore(query, ranked[0]);
  const secondScore = ranked.length > 1 ? candidateScore(query, ranked[1]) : -Infinity;
  if (topScore >= 90 && topScore - secondScore >= 8) {
    return { status: 'matched', matched: ranked[0], candidates: ranked };
  }
  return { status: 'ambiguous', matched: null, candidates: ranked };
}

export function summarizeCandidate(
  source: MetadataSource,
  queryName: string,
  status: MetadataStatus,
  matched: NormalizedMetadataCandidate | null,
  fetchedAt: string | null,
  errorMessage: string | null,
): GameMetadataSourceSummary {
  return {
    source,
    status,
    queryName,
    externalId: matched?.externalId ?? null,
    title: matched?.title ?? null,
    titleCn: matched?.titleCn ?? null,
    developer: matched?.developer ?? null,
    summary: matched?.summary ?? null,
    score: matched?.score ?? null,
    rank: matched?.rank ?? null,
    fetchedAt,
    errorMessage,
  };
}

/** Keep this deterministic for tests and for stable UI source ordering. */
export function metadataSourceOrder(): readonly MetadataSource[] {
  return SOURCE_ORDER;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asIdentifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return String(value);
  return asString(value);
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()];
    if (typeof item === 'object' && item !== null) {
      const text = asString((item as { v?: unknown }).v);
      return text ? [text] : [];
    }
    return [];
  });
}

function httpsImage(value: unknown): string | null {
  const candidate = asString(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:') return parsed.toString();
    // Bangumi's public API historically returns http://lain.bgm.tv image
    // links. Upgrade them before the downloader enforces HTTPS transport.
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function sourceUrl(source: MetadataSource, externalId: string): string {
  return source === 'vndb' ? `https://vndb.org/${externalId}` : `https://bgm.tv/subject/${externalId}`;
}

async function responseError(response: MetadataHttpResponse, source: MetadataSource): Promise<Error> {
  let detail = '';
  try {
    const body = (await response.text?.())?.trim() ?? '';
    if (body) {
      const parsed = JSON.parse(body) as unknown;
      const record = asRecord(parsed);
      const message = asString(record.message) ?? asString(record.error) ?? body;
      detail = `: ${message.slice(0, 240)}`;
    }
  } catch {
    // Keep the status-only error when an upstream error body is unreadable.
  }
  return new Error(`${source} request failed with status ${response.status}${detail}`);
}

async function expectJson(response: MetadataHttpResponse, source: MetadataSource): Promise<Record<string, unknown>> {
  if (!response.ok) throw await responseError(response, source);
  const value = await response.json();
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${source} returned an invalid JSON object`);
  }
  return value as Record<string, unknown>;
}

function vndbCandidate(value: unknown): NormalizedMetadataCandidate | null {
  const row = asRecord(value);
  const externalId = asString(row.id);
  const title = asString(row.title);
  if (!externalId || !title) return null;
  const image = asRecord(row.image);
  const developers = Array.isArray(row.developers)
    ? row.developers.flatMap((developer) => asString(asRecord(developer).name) ?? [])
    : [];
  const aliases = [asString(row.alttitle), ...asStringArray(row.aliases)].filter((item): item is string => Boolean(item));
  return {
    externalId,
    title,
    titleCn: null,
    aliases: [...new Set(aliases)],
    developer: developers[0] ?? null,
    summary: asString(row.description),
    score: asNumber(row.rating),
    rank: asNumber(row.rank),
    imageUrl: httpsImage(image.url),
    sourceUrl: sourceUrl('vndb', externalId),
  };
}

/** Search VNDB's official JSON API and return normalized candidates. */
export async function searchVndb(name: string, signal: AbortSignal, http: MetadataHttpClient): Promise<NormalizedMetadataCandidate[]> {
  const response = await http.fetch('https://api.vndb.org/kana/vn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      filters: ['search', '=', name],
      // `rank` was removed from the current Kana API field set. Requesting it
      // makes an otherwise valid search fail with HTTP 400.
      fields: 'id,title,alttitle,aliases,description,developers.name,rating,image.url',
      results: 10,
      sort: 'searchrank',
    }),
    signal,
  });
  const body = await expectJson(response, 'vndb');
  const results = Array.isArray(body.results) ? body.results : [];
  return results.map(vndbCandidate).filter((item): item is NormalizedMetadataCandidate => Boolean(item));
}

function bangumiDeveloper(detail: Record<string, unknown>): string | null {
  const direct = asString(detail.developer) ?? asString(detail.developers);
  if (direct) return direct;
  if (!Array.isArray(detail.infobox)) return null;
  for (const entry of detail.infobox) {
    const row = asRecord(entry);
    const key = asString(row.key)?.toLocaleLowerCase() ?? '';
    if (!key.includes('开发商') && !key.includes('developer')) continue;
    const values = asStringArray(row.value);
    if (values[0]) return values[0];
  }
  return null;
}

function bangumiCandidate(search: Record<string, unknown>, detail: Record<string, unknown>): NormalizedMetadataCandidate | null {
  const externalId = asIdentifier(detail.id) ?? asIdentifier(search.id);
  const title = asString(detail.name) ?? asString(search.name);
  if (!externalId || !title) return null;
  const images = asRecord(detail.images);
  const imageUrl = httpsImage(images.large) ?? httpsImage(images.medium) ?? httpsImage(images.common) ?? httpsImage(search.image);
  const aliases = [asString(detail.name_cn), asString(search.name_cn)].filter((item): item is string => Boolean(item));
  return {
    externalId,
    title,
    titleCn: asString(detail.name_cn) ?? asString(search.name_cn),
    aliases: [...new Set(aliases)],
    developer: bangumiDeveloper(detail),
    summary: asString(detail.summary) ?? asString(search.summary),
    score: asNumber(detail.score) ?? asNumber(search.score),
    rank: asNumber(detail.rank) ?? asNumber(search.rank),
    imageUrl,
    sourceUrl: sourceUrl('bangumi', externalId),
  };
}

/** Search Bangumi game subjects and enrich the first three results with details. */
export async function searchBangumi(name: string, signal: AbortSignal, http: MetadataHttpClient): Promise<NormalizedMetadataCandidate[]> {
  const searchResponse = await http.fetch('https://api.bgm.tv/v0/search/subjects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': APPLICATION_USER_AGENT,
    },
    body: JSON.stringify({ keyword: name, filter: { type: [4] }, sort: 'match', limit: 10 }),
    signal,
  });
  const searchBody = await expectJson(searchResponse, 'bangumi');
  const results = Array.isArray(searchBody.data)
    ? searchBody.data.map(asRecord).filter((item) => asIdentifier(item.id))
    : [];
  const enriched = await Promise.all(results.slice(0, 3).map(async (search) => {
    const id = asIdentifier(search.id)!;
    try {
      const detailResponse = await http.fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json', 'User-Agent': APPLICATION_USER_AGENT },
        signal,
      });
      const detail = await expectJson(detailResponse, 'bangumi');
      return bangumiCandidate(search, detail) ?? bangumiCandidate(search, search);
    } catch (error) {
      if (signal.aborted) throw error;
      return bangumiCandidate(search, search);
    }
  }));
  return enriched.filter((item): item is NormalizedMetadataCandidate => Boolean(item));
}

function defaultHttpClient(): MetadataHttpClient {
  return {
    async fetch(url, init) {
      const response = await fetch(url, init);
      return {
        ok: response.ok,
        status: response.status,
        headers: { get: (name: string) => response.headers.get(name) },
        json: () => response.json(),
        text: () => response.text(),
        arrayBuffer: () => response.arrayBuffer(),
      };
    },
  };
}

function childTimeout(parent: AbortSignal, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (parent.aborted) controller.abort();
  else parent.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parent.removeEventListener('abort', onAbort);
    },
  };
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || error instanceof Error && error.name === 'AbortError';
}

function sourceData(resolution: CandidateResolution): string {
  return JSON.stringify({ matched: resolution.matched, candidates: resolution.candidates });
}

function parseSourceData(row: GameSourceRow): { matched: NormalizedMetadataCandidate | null; candidates: NormalizedMetadataCandidate[] } {
  if (!row.dataJson) return { matched: null, candidates: [] };
  try {
    const data = JSON.parse(row.dataJson) as { matched?: unknown; candidates?: unknown };
    const matched = data.matched && typeof data.matched === 'object' ? data.matched as NormalizedMetadataCandidate : null;
    const candidates = Array.isArray(data.candidates)
      ? data.candidates.filter((item): item is NormalizedMetadataCandidate => typeof item === 'object' && item !== null)
      : [];
    return { matched, candidates };
  } catch {
    return { matched: null, candidates: [] };
  }
}

function emptySummary(source: MetadataSource, queryName: string): GameMetadataSourceSummary {
  return summarizeCandidate(source, queryName, 'pending', null, null, null);
}

function toSummary(row: GameSourceRow, queryName: string): GameMetadataSourceSummary {
  const data = parseSourceData(row);
  return summarizeCandidate(row.source, row.queryName || queryName, row.status === 'matched' ? 'matched' : row.status, data.matched, row.fetchedAt, row.errorMessage);
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function retryIso(now: () => Date): string {
  return new Date(now().getTime() + SOURCE_RETRY_MINUTES * 60 * 1000).toISOString();
}

function shouldQuery(row: GameSourceRow | undefined, current: Date, force: boolean): boolean {
  if (!row || force) return true;
  if (row.status === 'failed') {
    return !row.retryAfter || new Date(row.retryAfter).getTime() <= current.getTime();
  }
  return row.status === 'pending';
}

function isAutomaticCover(source: CoverSource): source is MetadataSource {
  return source === 'vndb' || source === 'bangumi';
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

type SQLiteDatabase = Database.Database;

export interface MetadataProgress {
  phase: 'metadata' | 'cover';
  current: number;
  total: number;
  currentFile: string;
}

export interface GameMetadataService {
  ensure(gameId: string, options: { signal: AbortSignal; force?: boolean; onProgress?: (progress: MetadataProgress) => void }): Promise<GameMetadataSummary>;
  getSummary(gameId: string): GameMetadataSummary;
  refresh(gameId: string, signal?: AbortSignal): Promise<GameMetadataSummary>;
}

export interface GameMetadataServiceOptions {
  db: SQLiteDatabase;
  getLibraryPath: () => string | Promise<string>;
  http?: MetadataHttpClient;
  now?: () => Date;
  download?: typeof downloadCover;
}

function sourceInput(
  gameId: string,
  source: MetadataSource,
  queryName: string,
  resolution: CandidateResolution,
  fetchedAt: string,
): GameSourceInput {
  return {
    gameId,
    source,
    externalId: resolution.matched?.externalId ?? null,
    queryName,
    status: resolution.status,
    dataJson: sourceData(resolution),
    imageUrl: resolution.matched?.imageUrl ?? null,
    fetchedAt,
    retryAfter: null,
    errorMessage: null,
  };
}

export function createGameMetadataService(options: GameMetadataServiceOptions): GameMetadataService {
  const http = options.http ?? defaultHttpClient();
  const now = options.now ?? (() => new Date());
  const download = options.download ?? downloadCover;

  const getSummary = (gameId: string): GameMetadataSummary => {
    const game = getGame(options.db, gameId);
    if (!game) throw new Error(`Game not found: ${gameId}`);
    const rows = getGameSources(options.db, gameId);
    const bySource = new Map(rows.map((row) => [row.source, row]));
    return {
      gameId,
      coverSource: game.coverSource,
      sources: SOURCE_ORDER.map((source) => {
        const row = bySource.get(source);
        return row ? toSummary(row, game.name) : emptySummary(source, game.name);
      }),
    };
  };

  const ensure = async (
    gameId: string,
    request: { signal: AbortSignal; force?: boolean; onProgress?: (progress: MetadataProgress) => void },
  ): Promise<GameMetadataSummary> => {
    const game = getGame(options.db, gameId);
    if (!game) throw new Error(`Game not found: ${gameId}`);
    const queryName = normalizeGameName(game.name);
    const current = now();
    const rows = getGameSources(options.db, gameId);
    const rowsBySource = new Map(rows.map((row) => [row.source, row]));
    const sourcesToQuery = SOURCE_ORDER.filter((source) => shouldQuery(rowsBySource.get(source), current, Boolean(request.force)));
    let completed = 0;
    request.onProgress?.({ phase: 'metadata', current: 0, total: sourcesToQuery.length, currentFile: game.name });

    await Promise.all(sourcesToQuery.map(async (source) => {
      const timeout = childTimeout(request.signal, REQUEST_TIMEOUT_MS);
      try {
        const candidates = source === 'vndb'
          ? await searchVndb(queryName, timeout.signal, http)
          : await searchBangumi(queryName, timeout.signal, http);
        const resolution = resolveCandidate(game.name, candidates);
        upsertGameSource(options.db, sourceInput(gameId, source, queryName, resolution, nowIso(now)));
      } catch (error) {
        if (isAbortError(error, request.signal)) throw error;
        const previous = getGameSource(options.db, gameId, source);
        upsertGameSource(options.db, {
          gameId,
          source,
          externalId: previous?.externalId ?? null,
          queryName,
          status: 'failed',
          dataJson: previous?.dataJson ?? null,
          imageUrl: previous?.imageUrl ?? null,
          fetchedAt: nowIso(now),
          retryAfter: retryIso(now),
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } finally {
        timeout.dispose();
        completed += 1;
        request.onProgress?.({ phase: 'metadata', current: completed, total: sourcesToQuery.length, currentFile: game.name });
      }
    }));

    const refreshedGame = getGame(options.db, gameId)!;
    const refreshedRows = getGameSources(options.db, gameId);
    const preferred = (['vndb', 'bangumi'] as MetadataSource[])
      .map((source) => refreshedRows.find((row) => row.source === source))
      .map((row) => row ? { row, matched: parseSourceData(row).matched } : null)
      .find((item): item is { row: GameSourceRow; matched: NormalizedMetadataCandidate } => Boolean(item?.row.status === 'matched' && item.matched?.imageUrl));

    if (preferred && refreshedGame.coverSource !== 'manual') {
      const libraryPathValue = await options.getLibraryPath();
      if (!libraryPathValue.trim()) throw new Error('Library path is not configured');
      const libraryPath = path.resolve(libraryPathValue);
      const targetDirectory = assertWithin(
        refreshedGame.folderPath && refreshedGame.folderPath.trim()
          ? refreshedGame.folderPath
          : path.join(libraryPath, sanitizeDirectoryName(refreshedGame.name)),
        libraryPath,
      );
      const existingAutomaticCover = isAutomaticCover(refreshedGame.coverSource) && refreshedGame.coverPath && await pathExists(refreshedGame.coverPath)
        ? refreshedGame.coverPath
        : null;
      if (!existingAutomaticCover) {
        request.onProgress?.({ phase: 'cover', current: 0, total: 1, currentFile: refreshedGame.name });
        try {
          const localPath = await download(preferred.matched.imageUrl!, targetDirectory, request.signal, http);
          const previousCover = refreshedGame.coverPath;
          setGameCover(options.db, gameId, localPath, preferred.row.source);
          if (previousCover && isAutomaticCover(refreshedGame.coverSource) && previousCover !== localPath && assertWithin(previousCover, libraryPath)) {
            await rm(previousCover, { force: true }).catch(() => undefined);
          }
        } catch (error) {
          if (isAbortError(error, request.signal)) throw error;
          upsertGameSource(options.db, {
            ...preferred.row,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
        request.onProgress?.({ phase: 'cover', current: 1, total: 1, currentFile: refreshedGame.name });
      }
    }

    return getSummary(gameId);
  };

  return {
    ensure,
    getSummary,
    refresh: (gameId, signal = new AbortController().signal) => ensure(gameId, { signal, force: true }),
  };
}
