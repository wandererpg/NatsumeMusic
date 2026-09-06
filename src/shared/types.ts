import type { ErrorCode, SerializedAppError } from './errors';

/** Playback behavior used by the player queue. */
export type PlayMode = 'sequential' | 'random' | 'single-loop' | 'list-loop';

export const THEME_IDS = [
  'rain-afterglow',
  'neon-terminal',
  'amber-film',
  'aquarium-glass',
  'record-shop',
  'velvet-theatre',
  'scrapbook-diary',
] as const;

export type ThemeId = typeof THEME_IDS[number];

export interface BackgroundSettings {
  imagePath: string | null;
  blur: number;
  dim: number;
  scale: number;
  positionX: number;
  positionY: number;
}

/** Top-level library collections shown by the sidebar. */
export type LibrarySection = 'library' | 'recent' | 'favorites' | 'playlists';

/** Persisted audio category derived from the track duration. */
export type TrackKind = 'music' | 'voice';

/** External game-information sources supported by the metadata importer. */
export type MetadataSource = 'vndb' | 'bangumi';
export type MetadataStatus = 'pending' | 'matched' | 'no_match' | 'failed' | 'ambiguous';
export type CoverSource = 'manual' | MetadataSource | null;

/** Sanitized source summary safe to send to the renderer. */
export interface GameMetadataSourceSummary {
  source: MetadataSource;
  status: MetadataStatus;
  queryName: string;
  externalId: string | null;
  title: string | null;
  titleCn: string | null;
  developer: string | null;
  summary: string | null;
  score: number | null;
  rank: number | null;
  fetchedAt: string | null;
  errorMessage: string | null;
}

export interface GameMetadataSummary {
  gameId: string;
  coverSource: CoverSource;
  sources: GameMetadataSourceSummary[];
}

/** Query contract shared by the renderer, preload and main-process library service. */
export interface TrackQuery {
  section?: LibrarySection;
  gameId?: string | null;
  playlistId?: string | null;
  search?: string;
  kind?: TrackKind | null;
}

/** A game entry persisted in the library database. */
export interface Game {
  id: string;
  name: string;
  coverPath: string | null;
  coverSource: CoverSource;
  /** The copied music folder, when at least one track is present. */
  folderPath?: string | null;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A copied audio file and its metadata. */
export interface Track {
  id: string;
  gameId: string;
  /** Display name of the original work this track belongs to. */
  gameName?: string;
  filePath: string;
  fileName: string;
  customName: string | null;
  displayName: string;
  duration: number | null;
  kind: TrackKind;
  format: string;
  fileSize: number;
  fileHash: string;
  trackNumber: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A user-created queue of tracks. */
export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  trackCount?: number;
  createdAt: string;
}

export interface PlaylistInput {
  id: string;
  name: string;
}

export interface GameUpdate {
  name?: string;
  coverPath?: string | null;
}

/** Progress emitted while scanning, extracting, or copying an import. */
export interface ScanProgress {
  phase: 'scanning' | 'extracting' | 'copying' | 'metadata' | 'cover';
  current: number;
  total: number;
  currentFile: string;
  /** A non-fatal entry error encountered while walking the source tree. */
  error?: ScanError;
  /** Optional child-process output for diagnostic progress surfaces. */
  output?: string;
}

/** A single source file that could not be imported. */
export interface ScanError {
  file: string;
  message: string;
  code?: ErrorCode;
}

/** Summary returned after an import completes (or is cancelled). */
export interface ScanResult {
  found: number;
  extracted: number;
  copied: number;
  skipped: number;
  errors: ScanError[];
  /** Source and local-cover outcome shown on the import completion screen. */
  metadata?: GameMetadataSummary;
}

/** Result envelope pushed by the main process when an asynchronous scan ends. */
export interface ScanResultEvent {
  requestId: string;
  result?: ScanResult;
  error?: SerializedAppError;
}

/** Aggregate information about the current library. */
export interface LibraryStats {
  gameCount: number;
  trackCount: number;
  totalDuration: number;
  totalSize: number;
}

/** Serializable player state shared with the renderer. */
export interface PlayerState {
  currentTrack: Track | null;
  playlist: Track[];
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number | null;
  currentTime: number;
}

/** Request payload used to start an import scan. */
export interface ScanStartRequest {
  sourcePath: string;
  gameName: string;
  deepScan: boolean;
  includeVoice: boolean;
  voiceThresholdSeconds: number;
}

/** Request payload for adding already-selected audio files. */
export interface AddTracksRequest {
  gameId: string;
  filePaths: string[];
}

/** Fields that can be edited from the track context menu. */
export interface TrackUpdate {
  customName?: string | null;
  trackNumber?: number;
  isFavorite?: boolean;
}

export type BulkTrackOperation =
  | { type: 'favorite'; isFavorite: boolean }
  | { type: 'playlist-add'; playlistId: string }
  | { type: 'move'; targetGameId: string }
  | { type: 'delete'; deleteFiles: boolean };

export interface BulkTrackRequest {
  sourceGameId: string;
  trackIds: string[];
  operation: BulkTrackOperation;
}

export interface BulkTrackFailure {
  trackId: string;
  userMessage: string;
}

export interface BulkTrackResult {
  succeededIds: string[];
  failures: BulkTrackFailure[];
}

/** Settings values used by the application and persisted as strings in SQLite. */
export interface AppSettings {
  libraryPath: string;
  volume: number;
  playMode: PlayMode;
  lastTrackId: string | null;
  voiceThresholdSeconds: number;
  themeId: ThemeId;
  background: BackgroundSettings;
  /** Optional global override for the theme's primary text color. */
  fontColor?: string | null;
  windowWidth?: number;
  windowHeight?: number;
}

export type AppSettingsUpdate = Pick<AppSettings, 'libraryPath' | 'volume' | 'playMode' | 'themeId' | 'background'> & {
  fontColor: string | null;
};

export interface PlayerTimeUpdate {
  currentTime: number;
  duration: number;
  progress: number;
}

export type ScanProgressListener = (progress: ScanProgress) => void;
export type ScanResultListener = (event: ScanResultEvent) => void;
export type PlayerStateListener = (state: PlayerState) => void;
export type PlayerTimeUpdateListener = (update: PlayerTimeUpdate) => void;
export type PlayerErrorListener = (error: SerializedAppError) => void;
export type Unsubscribe = () => void;
