import { create } from 'zustand';

import type { GalMusicAPI } from '../../../shared/ipc';
import type { BulkTrackRequest, BulkTrackResult, Game, GameUpdate, LibrarySection, Playlist, Track, TrackQuery, TrackUpdate } from '../../../shared/types';

function api(): GalMusicAPI | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as Window & { galMusic?: GalMusicAPI }).galMusic ?? null;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'userMessage' in error) {
    const userMessage = (error as { userMessage?: unknown }).userMessage;
    if (typeof userMessage === 'string') {
      return userMessage;
    }
  }
  return error instanceof Error ? error.message : '无法加载音乐库';
}

export interface LibraryStore {
  games: Game[];
  tracks: Track[];
  playlists: Playlist[];
  currentQuery: Required<TrackQuery>;
  isLoadingGames: boolean;
  isLoadingTracks: boolean;
  error: string | null;
  lastSearch: string;
  loadGames: () => Promise<Game[]>;
  loadTracks: (query: TrackQuery | string | null) => Promise<Track[]>;
  renameTrack: (trackId: string, customName: string | null) => Promise<Track | null>;
  toggleFavorite: (track: Track) => Promise<Track | null>;
  deleteTrack: (trackId: string) => Promise<void>;
  search: (query: string) => Promise<Track[]>;
  loadPlaylists: () => Promise<Playlist[]>;
  createPlaylist: (name: string) => Promise<Playlist | null>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  updateGame: (gameId: string, changes: GameUpdate) => Promise<Game | null>;
  deleteGame: (gameId: string) => Promise<boolean>;
  bulkUpdateTracks: (request: BulkTrackRequest) => Promise<BulkTrackResult | null>;
  reset: () => void;
}

const initialState = {
  games: [] as Game[],
  tracks: [] as Track[],
  playlists: [] as Playlist[],
  currentQuery: { section: 'library', gameId: null, playlistId: null, search: '', kind: null } as Required<TrackQuery>,
  isLoadingGames: false,
  isLoadingTracks: false,
  error: null as string | null,
  lastSearch: '',
};

function normalizeQuery(input: TrackQuery | string | null): Required<TrackQuery> {
  if (input === null || typeof input === 'string') {
    return { section: 'library', gameId: input, playlistId: null, search: '', kind: null };
  }
  return {
    section: input.section ?? 'library',
    gameId: input.gameId ?? null,
    playlistId: input.playlistId ?? null,
    search: input.search?.trim() ?? '',
    kind: input.kind ?? null,
  };
}

let tracksRequest = 0;

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  ...initialState,

  async loadGames() {
    set({ isLoadingGames: true, error: null });
    try {
      const result = await api()?.getGames();
      const games = result ?? [];
      set({ games, isLoadingGames: false });
      return games;
    } catch (error) {
      set({ isLoadingGames: false, error: getErrorMessage(error) });
      return [];
    }
  },

  async loadTracks(gameId) {
    const query = normalizeQuery(gameId);
    const request = ++tracksRequest;
    set({ isLoadingTracks: true, error: null, lastSearch: query.search, currentQuery: query });
    try {
      const result = await api()?.getTracks(query);
      const tracks = result ?? [];
      if (request !== tracksRequest) return get().tracks;
      set({ tracks, isLoadingTracks: false });
      return tracks;
    } catch (error) {
      if (request !== tracksRequest) return get().tracks;
      set({ isLoadingTracks: false, error: getErrorMessage(error) });
      return [];
    }
  },

  async renameTrack(trackId, customName) {
    const current = get().tracks.find((track) => track.id === trackId);
    if (!current) {
      return null;
    }
    try {
      const updated = await api()?.updateTrack(trackId, { customName });
      const track = updated ?? { ...current, customName, displayName: customName?.trim() || current.fileName };
      set((state) => ({
        tracks: state.tracks.map((item) => item.id === trackId ? track : item),
      }));
      return track;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  async toggleFavorite(track) {
    try {
      const updated = await api()?.updateTrack(track.id, { isFavorite: !track.isFavorite });
      const nextTrack = updated ?? { ...track, isFavorite: !track.isFavorite };
      if (get().currentQuery.section === 'favorites' && !nextTrack.isFavorite) {
        await get().loadTracks(get().currentQuery);
      } else {
        set((state) => ({ tracks: state.tracks.map((item) => item.id === track.id ? nextTrack : item) }));
      }
      return nextTrack;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  async deleteTrack(trackId) {
    const current = get().tracks.find((track) => track.id === trackId);
    try {
      await api()?.deleteTrack(trackId);
      set((state) => {
        if (!current) {
          return state;
        }
        return {
          tracks: state.tracks.filter((track) => track.id !== trackId),
          games: state.games.map((game) => game.id === current.gameId
            ? { ...game, trackCount: Math.max(0, game.trackCount - 1) }
            : game),
        };
      });
      // The database cascades playlist_tracks when a track is removed. Keep
      // the sidebar counts in sync with that authoritative state as well.
      await get().loadPlaylists();
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  async search(query) {
    const normalized = query.trim();
    return get().loadTracks({ ...get().currentQuery, search: normalized });
  },

  async loadPlaylists() {
    try {
      const result = await api()?.getPlaylists?.();
      const playlists = result ?? [];
      set({ playlists });
      return playlists;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return [];
    }
  },

  async createPlaylist(name) {
    try {
      const playlist = await api()?.createPlaylist?.(name);
      if (!playlist) return null;
      set((state) => ({ playlists: [...state.playlists, playlist] }));
      return playlist;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  async deletePlaylist(playlistId) {
    try {
      await api()?.deletePlaylist?.(playlistId);
      set((state) => ({ playlists: state.playlists.filter((playlist) => playlist.id !== playlistId) }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  async addTrackToPlaylist(playlistId, trackId) {
    try {
      await api()?.addTrackToPlaylist?.(playlistId, trackId);
      await get().loadPlaylists();
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  async removeTrackFromPlaylist(playlistId, trackId) {
    try {
      await api()?.removeTrackFromPlaylist?.(playlistId, trackId);
      if (get().currentQuery.section === 'playlists' && get().currentQuery.playlistId === playlistId) {
        await get().loadTracks(get().currentQuery);
      }
      await get().loadPlaylists();
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  async updateGame(gameId, changes) {
    try {
      const updated = await api()?.updateGame?.(gameId, changes);
      if (!updated) return null;
      set((state) => ({ games: state.games.map((game) => game.id === gameId ? updated : game) }));
      // A folder rename changes every track.filePath. Reload the active query
      // so playback, “open folder”, and cover URLs never retain stale paths.
      const currentQuery = get().currentQuery;
      if (currentQuery.section === 'library' && currentQuery.gameId === gameId) {
        await get().loadTracks(currentQuery);
      }
      return updated;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  async deleteGame(gameId) {
    try {
      await api()?.deleteGame?.(gameId);
      set((state) => ({
        games: state.games.filter((game) => game.id !== gameId),
        tracks: state.tracks.filter((track) => track.gameId !== gameId),
      }));
      await get().loadPlaylists();
      return true;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return false;
    }
  },

  async bulkUpdateTracks(request) {
    try {
      const bridge = api();
      if (!bridge) throw new Error('批量操作仅能在桌面应用中使用');
      const result = await bridge.bulkUpdateTracks(request);
      await Promise.all([
        get().loadTracks(get().currentQuery),
        get().loadGames(),
        get().loadPlaylists(),
      ]);
      return result;
    } catch (error) {
      set({ error: getErrorMessage(error) });
      return null;
    }
  },

  reset() {
    set({ ...initialState });
  },
}));

/** Non-hook alias for event handlers and integration tests. */
export const libraryStore = useLibraryStore;

export type { TrackUpdate };
