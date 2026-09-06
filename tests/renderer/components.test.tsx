/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/renderer/src/App';
import { useLibraryStore } from '../../src/renderer/src/stores/libraryStore';
import { useUiStore } from '../../src/renderer/src/stores/uiStore';
import type { Game, Track } from '../../src/shared/types';

const game: Game = {
  id: 'game-1',
  name: 'ATRI -My Dear Moments-',
  coverPath: null,
  coverSource: null,
  trackCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const track: Track = {
  id: 'track-1',
  gameId: game.id,
  gameName: game.name,
  filePath: 'C:/Music/ATRI/opening.ogg',
  fileName: 'opening.ogg',
  customName: null,
  displayName: 'Opening theme',
  duration: 185,
  kind: 'music',
  format: 'ogg',
  fileSize: 1024 * 1024 * 4,
  fileHash: 'hash-1',
  trackNumber: 1,
  isFavorite: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockGalMusic(games: Game[] = [], tracks: Track[] = []) {
  window.galMusic = {
    startScan: vi.fn(),
    cancelScan: vi.fn(),
    getGames: vi.fn().mockResolvedValue(games),
    getTracks: vi.fn().mockResolvedValue(tracks),
    addTracks: vi.fn(),
    updateTrack: vi.fn().mockImplementation(async (trackId: string, changes: Partial<Track>) => ({
      ...track,
      id: trackId,
      ...changes,
      displayName: changes.customName || track.displayName,
    })),
    deleteTrack: vi.fn().mockResolvedValue(undefined),
    bulkUpdateTracks: vi.fn().mockResolvedValue({ succeededIds: [], failures: [] }),
    search: vi.fn().mockResolvedValue(tracks),
    selectFolder: vi.fn().mockResolvedValue(null),
    selectFiles: vi.fn().mockResolvedValue([]),
    selectImage: vi.fn().mockResolvedValue(null),
    openExplorer: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({
      libraryPath: '',
      volume: 0.8,
      playMode: 'list-loop',
      lastTrackId: null,
      voiceThresholdSeconds: 25,
    }),
    setSetting: vi.fn().mockResolvedValue(undefined),
    onScanProgress: vi.fn().mockReturnValue(() => undefined),
    onPlayerStateChange: vi.fn().mockReturnValue(() => undefined),
    onPlayerTimeUpdate: vi.fn().mockReturnValue(() => undefined),
    onPlayerError: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('renderer shell', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mockGalMusic();
    useLibraryStore.getState().reset();
    useUiStore.getState().reset();
  });

  it('renders an empty-library call to action when no games exist', async () => {
    render(<App />);

    expect(await screen.findByTestId('empty-library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导入游戏音乐/i })).toBeInTheDocument();
  });

  it('shows NatsumeMusic as the visible application name', async () => {
    render(<App />);

    expect(await screen.findByText('NatsumeMusic')).toBeInTheDocument();
    expect(screen.queryByText('GalMusic')).not.toBeInTheDocument();
  });

  it('renders the game list and track rows when data exists', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    expect(await screen.findByTestId('game-list')).toBeInTheDocument();
    expect(await screen.findByTestId(`track-row-${track.id}`)).toBeInTheDocument();
    expect(screen.getByText(track.displayName)).toBeInTheDocument();
  });

  it('keeps track column headers while removing helper copy from the library shell', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    expect(await screen.findByRole('columnheader', { name: '曲目' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '格式' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '时长' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '大小' })).toBeInTheDocument();
    expect(screen.queryByText(/双击即可播放/)).not.toBeInTheDocument();
    expect(screen.queryByText('按曲目编号')).not.toBeInTheDocument();
    expect(screen.queryByText('仅保存在本机')).not.toBeInTheDocument();
  });

  it('mounts one shared SVG refraction definition for the liquid-glass table header', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    const defs = await screen.findByTestId('liquid-glass-defs');
    expect(defs.querySelector('#natsume-liquid-refraction')).toBeInTheDocument();
    expect(defs.querySelector('feDisplacementMap')).toBeInTheDocument();
  });

  it('places the track table inside the single right-side main content scroller', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    const mainContent = await screen.findByTestId('main-content');
    const table = await screen.findByTestId('track-table');
    expect(mainContent).toContainElement(table);
    expect(mainContent).toHaveAttribute('data-scroll-surface', 'library');
  });

  it('plays a track after a row is double-clicked', async () => {
    mockGalMusic([game], [track]);
    const playTrack = vi.fn();
    render(<App onPlayTrack={playTrack} />);

    const row = await screen.findByTestId(`track-row-${track.id}`);
    fireEvent.doubleClick(row);

    await waitFor(() => expect(playTrack).toHaveBeenCalledWith(track));
  });

  it('loads each sidebar collection with its own query instead of reusing the selected game', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    const api = window.galMusic;
    await screen.findByTestId('game-list');
    fireEvent.click(screen.getByTestId('sidebar-nav-recent'));

    await waitFor(() => expect(api.getTracks).toHaveBeenLastCalledWith({
      section: 'recent',
      gameId: null,
      playlistId: null,
      search: '',
      kind: null,
    }));
  });

  it('filters a selected game by music or voice without changing other collections', async () => {
    mockGalMusic([game], [track]);
    render(<App />);
    fireEvent.click(await screen.findByTestId(`game-item-${game.id}`));

    expect(await screen.findByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '语音' }));
    await waitFor(() => expect(window.galMusic.getTracks).toHaveBeenLastCalledWith({
      section: 'library', gameId: game.id, playlistId: null, search: '', kind: 'voice',
    }));
    fireEvent.click(screen.getByRole('button', { name: '音乐' }));
    await waitFor(() => expect(window.galMusic.getTracks).toHaveBeenLastCalledWith({
      section: 'library', gameId: game.id, playlistId: null, search: '', kind: 'music',
    }));
  });

  it('toggles a track favorite without leaving the current collection', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    const row = await screen.findByTestId(`track-row-${track.id}`);
    fireEvent.click(screen.getByTestId(`favorite-track-${track.id}`));

    await waitFor(() => expect(window.galMusic.updateTrack).toHaveBeenCalledWith(track.id, { isFavorite: true }));
    expect(row).toBeInTheDocument();
  });

  it('opens the game editor from a single game folder entry', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    await screen.findByTestId(`game-item-${game.id}`);
    fireEvent.click(screen.getByTestId(`edit-game-${game.id}`));

    expect(await screen.findByTestId('game-editor')).toBeInTheDocument();
  });

  it('passes the player ratio to the progress bar without converting it twice', async () => {
    mockGalMusic([game], [track]);
    render(<App playerState={{ currentTrack: track, progress: 0.004, duration: 100, currentTime: 0.4 }} />);

    await screen.findByTestId(`track-row-${track.id}`);
    expect(screen.getByTestId('player-progress-fill')).toHaveStyle({ width: '0.4%' });
  });
});
