import { Howl } from 'howler';

import type {
  PlayMode,
  PlayerTimeUpdate,
  Track,
} from '../../../shared/types';
import { toAudioUrl } from '../../../shared/audio-url';

export interface PlayerEngineCallbacks {
  onPlay?: (track: Track) => void;
  onPause?: (track: Track) => void;
  onTimeUpdate?: (update: PlayerTimeUpdate) => void;
  /** Alias retained for callers that use the shorter callback name. */
  onTime?: (update: PlayerTimeUpdate) => void;
  onEnd?: (track: Track) => void;
  onError?: (error: unknown, track: Track | null) => void;
  onTrackChange?: (track: Track | null, index: number) => void;
}

export interface PlayerEngineOptions extends PlayerEngineCallbacks {
  volume?: number;
  /** Injected for deterministic random queue tests. */
  random?: () => number;
  timeUpdateInterval?: number;
}

type TrackSelection = Track | number;

const DEFAULT_VOLUME = 0.8;
const DEFAULT_TIME_UPDATE_INTERVAL = 250;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

/** Backwards-compatible alias for callers that imported the old helper. */
export const toFileUrl = toAudioUrl;

function extensionFor(track: Track): string {
  const fromMetadata = track.format.trim().replace(/^\./, '').toLowerCase();
  if (fromMetadata) {
    return fromMetadata;
  }
  const match = track.filePath.match(/\.([^.\\/]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * Small Howler adapter responsible only for audio lifecycle and queue rules.
 * Zustand (in playerStore) owns the serializable UI state.
 */
export class PlayerEngine {
  private howl: Howl | null = null;
  private queue: Track[] = [];
  private currentIndex = -1;
  private mode: PlayMode = 'sequential';
  private volume: number;
  private isPlaying = false;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly callbacks: PlayerEngineCallbacks;
  private readonly random: () => number;
  private readonly timeUpdateInterval: number;

  constructor(options: PlayerEngineOptions = {}) {
    this.volume = clampVolume(options.volume ?? DEFAULT_VOLUME);
    this.callbacks = options;
    this.random = options.random ?? Math.random;
    this.timeUpdateInterval = options.timeUpdateInterval ?? DEFAULT_TIME_UPDATE_INTERVAL;
  }

  get currentTrack(): Track | null {
    return this.queue[this.currentIndex] ?? null;
  }

  get playlist(): Track[] {
    return [...this.queue];
  }

  get index(): number {
    return this.currentIndex;
  }

  get playMode(): PlayMode {
    return this.mode;
  }

  get currentVolume(): number {
    return this.volume;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  /** Replace the queue and load its selected item without auto-playing. */
  setQueue(tracks: Track[], index = 0, autoPlay = false): void {
    // A disposed engine can be reused when a renderer is mounted again.
    this.disposed = false;
    this.unloadCurrentHowl();
    this.queue = [...tracks];
    this.currentIndex = this.queue.length === 0
      ? -1
      : Math.min(Math.max(index, 0), this.queue.length - 1);
    this.isPlaying = false;

    if (this.currentTrack) {
      this.loadCurrentTrack(autoPlay);
    } else {
      this.callbacks.onTrackChange?.(null, -1);
    }
  }

  /** Select a track or index, loading it without starting playback. */
  select(selection: TrackSelection): void {
    this.disposed = false;
    const nextIndex = typeof selection === 'number'
      ? selection
      : this.queue.findIndex((track) => track.id === selection.id);

    if (typeof selection !== 'number' && nextIndex < 0) {
      this.setQueue([selection]);
      return;
    }
    if (nextIndex < 0 || nextIndex >= this.queue.length) {
      return;
    }
    if (nextIndex === this.currentIndex && this.howl) {
      return;
    }
    this.unloadCurrentHowl();
    this.currentIndex = nextIndex;
    this.isPlaying = false;
    this.loadCurrentTrack(false);
  }

  /** Load an individual track and optionally start it immediately. */
  load(track: Track, autoPlay = false): void {
    this.disposed = false;
    const existingIndex = this.queue.findIndex((candidate) => candidate.id === track.id);
    if (existingIndex < 0) {
      this.setQueue([track], 0, autoPlay);
      return;
    }
    this.select(existingIndex);
    if (autoPlay) {
      this.play();
    }
  }

  play(selection?: TrackSelection): void {
    this.disposed = false;
    if (selection !== undefined) {
      const nextIndex = typeof selection === 'number'
        ? selection
        : this.queue.findIndex((track) => track.id === selection.id);
      if (typeof selection !== 'number' && nextIndex < 0) {
        this.setQueue([selection], 0, true);
        return;
      }
      if (nextIndex >= 0 && nextIndex < this.queue.length && nextIndex !== this.currentIndex) {
        this.select(nextIndex);
      }
    }
    if (!this.currentTrack) {
      return;
    }
    if (!this.howl) {
      this.loadCurrentTrack(false);
    }
    this.howl?.play();
  }

  pause(): void {
    if (this.disposed) {
      return;
    }
    this.howl?.pause();
  }

  toggle(): void {
    if (this.isPlaying || this.howl?.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(position?: number): number {
    if (!this.howl) {
      return 0;
    }
    if (position === undefined) {
      return this.readSeek();
    }
    const duration = this.readDuration();
    const next = Number.isFinite(position) ? Math.min(Math.max(position, 0), duration || position) : 0;
    this.howl.seek(next);
    this.emitTimeUpdate();
    return next;
  }

  setVolume(value: number): number {
    this.volume = clampVolume(value);
    this.howl?.volume(this.volume);
    return this.volume;
  }

  setPlayMode(mode: PlayMode): void {
    this.mode = mode;
  }

  next(autoPlay = true): Track | null {
    return this.advance(autoPlay);
  }

  previous(autoPlay = true): Track | null {
    if (this.queue.length === 0) {
      return null;
    }
    const nextIndex = this.currentIndex > 0
      ? this.currentIndex - 1
      : this.mode === 'list-loop' ? this.queue.length - 1 : 0;
    this.switchTo(nextIndex, autoPlay);
    return this.currentTrack;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopTimer();
    this.unloadCurrentHowl();
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
  }

  private advance(autoPlay: boolean): Track | null {
    if (this.queue.length === 0) {
      return null;
    }
    const nextIndex = this.nextIndex();
    if (nextIndex < 0) {
      this.isPlaying = false;
      this.stopTimer();
      return null;
    }
    this.switchTo(nextIndex, autoPlay);
    return this.currentTrack;
  }

  private nextIndex(): number {
    if (this.queue.length <= 1) {
      return this.mode === 'sequential' ? -1 : this.currentIndex;
    }
    switch (this.mode) {
      case 'single-loop':
        return this.currentIndex;
      case 'list-loop':
        return (this.currentIndex + 1) % this.queue.length;
      case 'random': {
        const candidates = this.queue.map((_, index) => index).filter((index) => index !== this.currentIndex);
        const offset = Math.floor(Math.min(Math.max(this.random(), 0), 0.999999) * candidates.length);
        return candidates[offset] ?? candidates[0];
      }
      case 'sequential':
      default:
        return this.currentIndex + 1 < this.queue.length ? this.currentIndex + 1 : -1;
    }
  }

  private switchTo(index: number, autoPlay: boolean): void {
    if (index === this.currentIndex && this.howl) {
      if (this.mode === 'single-loop') {
        this.howl.seek(0);
      }
      if (autoPlay) {
        this.howl.play();
      }
      return;
    }
    this.unloadCurrentHowl();
    this.currentIndex = index;
    this.isPlaying = false;
    this.loadCurrentTrack(autoPlay);
  }

  private loadCurrentTrack(autoPlay: boolean): void {
    const track = this.currentTrack;
    if (!track) {
      return;
    }
    const options = {
      src: [toAudioUrl(track.filePath)],
      html5: true,
      format: [extensionFor(track)],
      volume: this.volume,
      onload: () => this.emitTimeUpdate(),
      onplay: () => {
        this.isPlaying = true;
        this.startTimer();
        this.callbacks.onPlay?.(track);
      },
      onpause: () => {
        this.isPlaying = false;
        this.stopTimer();
        this.callbacks.onPause?.(track);
        this.emitTimeUpdate();
      },
      onend: () => this.handleEnd(track),
      onloaderror: (_id: number, error: unknown) => this.callbacks.onError?.(error, track),
      onplayerror: (_id: number, error: unknown) => this.callbacks.onError?.(error, track),
    };
    this.howl = new Howl(options);
    this.callbacks.onTrackChange?.(track, this.currentIndex);
    if (autoPlay) {
      this.howl.play();
    }
  }

  private handleEnd(track: Track): void {
    this.stopTimer();
    this.isPlaying = false;
    this.callbacks.onEnd?.(track);
    if (this.mode === 'single-loop') {
      this.howl?.seek(0);
      this.howl?.play();
      return;
    }
    this.advance(true);
  }

  private emitTimeUpdate(): void {
    const currentTrack = this.currentTrack;
    if (!currentTrack || !this.howl) {
      return;
    }
    const duration = this.readDuration();
    const currentTime = this.readSeek();
    const update: PlayerTimeUpdate = {
      currentTime,
      duration,
      progress: duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0,
    };
    this.callbacks.onTimeUpdate?.(update);
    this.callbacks.onTime?.(update);
  }

  private readSeek(): number {
    const value = this.howl?.seek();
    if (Array.isArray(value)) {
      return Number(value[0]) || 0;
    }
    return Number(value) || 0;
  }

  private readDuration(): number {
    return Number(this.howl?.duration() ?? this.currentTrack?.duration ?? 0) || 0;
  }

  private startTimer(): void {
    this.stopTimer();
    if (this.timeUpdateInterval <= 0) {
      return;
    }
    this.timer = setInterval(() => this.emitTimeUpdate(), this.timeUpdateInterval);
    // Node's timer type exposes unref while browser timers do not.
    (this.timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private unloadCurrentHowl(): void {
    this.stopTimer();
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
  }

}

export default PlayerEngine;
