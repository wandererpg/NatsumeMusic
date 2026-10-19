import type { CoverSource, MetadataSource, Track } from './types';

export const SYNC_FORMAT = 'natsume-library';
export const SYNC_VERSION = 1;
export const SYNC_EXPORT = 'library-sync:export';
export const SYNC_PREVIEW = 'library-sync:preview';
export const SYNC_APPLY = 'library-sync:apply';
export type SyncPreference = 'local' | 'incoming';

export interface SyncFile { path: string; size: number; sha256: string }
export interface SyncMetadata {
  source: MetadataSource;
  externalId: string | null;
  queryName: string;
  status: 'pending' | 'matched' | 'no_match' | 'failed' | 'ambiguous';
  dataJson: string | null;
  imageUrl: string | null;
  fetchedAt: string | null;
  matchMethod: 'auto' | 'manual' | null;
  confirmedAt: string | null;
}
export interface SyncGame {
  id: string; name: string; cover: SyncFile | null; coverSource: CoverSource; metadata: SyncMetadata[];
}
export interface SyncTrack extends Pick<Track, 'id' | 'gameId' | 'fileName' | 'customName' | 'duration' | 'kind' | 'format' | 'trackNumber' | 'isFavorite'> { file: SyncFile; sourceMd5?: string }
export interface SyncPlaylist { id: string; name: string; trackIds: string[] }
export interface SyncManifest {
  format: typeof SYNC_FORMAT; version: typeof SYNC_VERSION; application: string; createdAt: string;
  games: SyncGame[]; tracks: SyncTrack[]; playlists: SyncPlaylist[];
}
export interface SyncConflict { kind: 'game' | 'track' | 'metadata' | 'playlist'; name: string }
export interface SyncPreview {
  token: string; application: string; createdAt: string;
  games: number; tracks: number; playlists: number;
  newGames: number; newTracks: number; newPlaylists: number;
  totalBytes: number; conflicts: SyncConflict[]; conflictCount: number;
}
export interface SyncExportResult { manifestPath: string; tracks: number; totalBytes: number }
export interface SyncApplyResult { games: number; tracks: number; playlists: number; updated: number }
export interface LibrarySyncAPI {
  exportSyncPackage?(): Promise<SyncExportResult | null>;
  previewSyncPackage?(): Promise<SyncPreview | null>;
  applySyncPackage?(token: string, preference: SyncPreference): Promise<SyncApplyResult>;
}
