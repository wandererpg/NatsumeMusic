import { create } from 'zustand';

import type { GalMusicAPI } from '../../../shared/ipc';
import type { AppSettings, PlayMode, PlayerState, Track } from '../../../shared/types';
import { PlayerEngine } from '../player/PlayerEngine';

export interface PlayerStore extends PlayerState {
  /** The id is persisted separately from serializable playback state. */
  lastTrackId: string | null;
  error: unknown | null;
  initialize: () => Promise<void>;
  setPlaylist: (playlist: Track[], startIndex?: number) => void;
  playTrack: (track: Track, playlist?: Track[]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => Track | null;
  previous: () => Track | null;
  seek: (position?: number) => number;
  setVolume: (volume: number) => void;
  setPlayMode: (mode: PlayMode) => void;
  reconcileLibraryTracks: (
    refreshedTracks: Track[],
    removedIds: ReadonlySet<string>,
  ) => void;
  reset: () => void;
  dispose: () => void;
}

const DEFAULT_VOLUME = 0.8;
const DEFAULT_STATE: Pick<PlayerStore, 'currentTrack' | 'playlist' | 'playMode' | 'isPlaying' | 'volume' | 'progress' | 'duration' | 'currentTime' | 'lastTrackId' | 'error'> = {
  currentTrack: null,
  playlist: [],
  playMode: 'sequential',
  isPlaying: false,
  volume: DEFAULT_VOLUME,
  progress: 0,
  duration: null,
  currentTime: 0,
  lastTrackId: null,
  error: null,
};

function getGalMusicApi(): GalMusicAPI | null {
  if (typeof window === 'undefined' || !window.galMusic) {
    return null;
  }
  return window.galMusic;
}

function persistSetting(key: string, value: string): void {
  try {
    const api = getGalMusicApi();
    if (api) {
      void api.setSetting(key, value).catch(() => undefined);
    }
  } catch {
    // Settings persistence should not interrupt an active playback gesture.
  }
}

function normalizedVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizedPlayMode(value: PlayMode | string | undefined): PlayMode {
  if (value === 'sequential' || value === 'random' || value === 'single-loop' || value === 'list-loop') {
    return value;
  }
  return 'sequential';
}

/** The Howler instance is intentionally kept outside Zustand's serializable state. */
export const playerEngine = new PlayerEngine({
  volume: DEFAULT_VOLUME,
  onTrackChange: (track, index) => {
    usePlayerStore.setState((state) => ({
      currentTrack: track,
      currentTime: 0,
      progress: 0,
      duration: track?.duration ?? null,
      // A track selected by next/previous is also the last track to restore.
      lastTrackId: track?.id ?? state.lastTrackId,
    }));
    if (track) {
      persistSetting('last_track_id', track.id);
    }
    void index;
  },
  onPlay: (track) => {
    usePlayerStore.setState({
      currentTrack: track,
      isPlaying: true,
      error: null,
      lastTrackId: track.id,
      duration: track.duration ?? null,
    });
    persistSetting('last_track_id', track.id);
  },
  onPause: () => {
    usePlayerStore.setState({ isPlaying: false });
  },
  onTimeUpdate: (update) => {
    usePlayerStore.setState(update);
  },
  onEnd: () => {
    usePlayerStore.setState({ isPlaying: false });
  },
  onError: (error) => {
    usePlayerStore.setState({ isPlaying: false, error });
  },
});

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ...DEFAULT_STATE,

  initialize: async () => {
    const api = getGalMusicApi();
    if (!api) {
      return;
    }
    const settings: AppSettings = await api.getSettings();
    const volume = normalizedVolume(settings.volume);
    const playMode = normalizedPlayMode(settings.playMode);
    playerEngine.setVolume(volume);
    playerEngine.setPlayMode(playMode);
    set({ volume, playMode, lastTrackId: settings.lastTrackId ?? null, isPlaying: false });
    // Deliberately do not call play(): a restart restores preference only.
  },

  setPlaylist: (playlist, startIndex = 0) => {
    playerEngine.setQueue(playlist, startIndex, false);
    const selected = playlist[startIndex] ?? null;
    set({
      playlist: [...playlist],
      currentTrack: selected,
      isPlaying: false,
      currentTime: 0,
      progress: 0,
      duration: selected?.duration ?? null,
      error: null,
    });
  },

  playTrack: (track, playlist) => {
    if (playlist) {
      const index = playlist.findIndex((candidate) => candidate.id === track.id);
      playerEngine.setQueue(playlist, index >= 0 ? index : 0, true);
      set({ playlist: [...playlist] });
    } else {
      playerEngine.play(track);
      if (!get().playlist.some((candidate) => candidate.id === track.id)) {
        set({ playlist: [track] });
      }
    }
    set({ lastTrackId: track.id, error: null });
    persistSetting('last_track_id', track.id);
  },

  play: () => {
    playerEngine.play();
  },

  pause: () => {
    playerEngine.pause();
  },

  toggle: () => {
    playerEngine.toggle();
  },

  next: () => playerEngine.next(true),

  previous: () => playerEngine.previous(true),

  seek: (position) => playerEngine.seek(position),

  setVolume: (volume) => {
    const nextVolume = playerEngine.setVolume(volume);
    set({ volume: nextVolume });
    persistSetting('volume', String(nextVolume));
  },

  setPlayMode: (playMode) => {
    const nextMode = normalizedPlayMode(playMode);
    playerEngine.setPlayMode(nextMode);
    set({ playMode: nextMode });
    persistSetting('play_mode', nextMode);
  },

  reconcileLibraryTracks: (refreshedTracks, removedIds) => {
    const state = get();
    const current = state.currentTrack;
    if (current && removedIds.has(current.id)) {
      playerEngine.setQueue([]);
      set({
        playlist: [],
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        progress: 0,
        duration: null,
        error: null,
      });
      return;
    }

    const refreshedById = new Map(refreshedTracks.map((track) => [track.id, track]));
    const nextPlaylist = state.playlist
      .filter((track) => !removedIds.has(track.id))
      .map((track) => refreshedById.get(track.id) ?? track);
    const nextCurrent = current ? refreshedById.get(current.id) ?? current : null;
    const queueChanged = state.playlist.some((track, index) => {
      const next = nextPlaylist[index];
      return !next || next.id !== track.id || next.filePath !== track.filePath;
    }) || nextPlaylist.length !== state.playlist.length;

    if (queueChanged) {
      const currentIndex = nextCurrent
        ? Math.max(0, nextPlaylist.findIndex((track) => track.id === nextCurrent.id))
        : 0;
      playerEngine.setQueue(nextPlaylist, currentIndex, false);
    }
    set({
      playlist: nextPlaylist,
      currentTrack: nextCurrent,
      isPlaying: queueChanged ? false : state.isPlaying,
      duration: nextCurrent?.duration ?? null,
    });
  },

  reset: () => {
    playerEngine.setQueue([]);
    playerEngine.setVolume(DEFAULT_VOLUME);
    playerEngine.setPlayMode('sequential');
    set({ ...DEFAULT_STATE });
  },

  dispose: () => {
    playerEngine.dispose();
    set({ isPlaying: false });
  },
}));

/** Alias for non-React consumers (tests and renderer event handlers). */
export const playerStore = usePlayerStore;

export default usePlayerStore;
