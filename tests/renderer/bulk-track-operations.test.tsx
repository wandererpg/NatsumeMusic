/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/renderer/src/App';
import { useLibraryStore } from '../../src/renderer/src/stores/libraryStore';
import { usePlayerStore } from '../../src/renderer/src/stores/playerStore';
import { useUiStore } from '../../src/renderer/src/stores/uiStore';
import type { BulkTrackResult, Game, Playlist, Track } from '../../src/shared/types';

const games: Game[] = [
  { id: 'game-1', name: 'Source Game', coverPath: null, coverSource: null, trackCount: 5, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'game-2', name: 'Target Game', coverPath: null, coverSource: null, trackCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const tracks: Track[] = Array.from({ length: 5 }, (_, index) => ({
  id: `track-${index + 1}`,
  gameId: 'game-1',
  gameName: 'Source Game',
  filePath: `C:/Music/Source Game/音乐/track-${index + 1}.ogg`,
  fileName: `track-${index + 1}.ogg`,
  customName: null,
  displayName: `Track ${index + 1}`,
  duration: 120,
  kind: index === 2 ? 'voice' : 'music',
  format: 'ogg',
  fileSize: 1024,
  fileHash: `hash-${index + 1}`,
  trackNumber: index + 1,
  isFavorite: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}));

const playlists: Playlist[] = [
  { id: 'playlist-1', name: '夜间播放', trackIds: [], trackCount: 0, createdAt: '2026-01-01' },
];

function installApi(result: BulkTrackResult = { succeededIds: ['track-1', 'track-2'], failures: [] }) {
  window.galMusic = {
    startScan: vi.fn(), cancelScan: vi.fn(), addTracks: vi.fn(),
    getGames: vi.fn().mockResolvedValue(games),
    getTracks: vi.fn().mockResolvedValue(tracks),
    updateTrack: vi.fn(), deleteTrack: vi.fn(), search: vi.fn(),
    getPlaylists: vi.fn().mockResolvedValue(playlists),
    createPlaylist: vi.fn(), deletePlaylist: vi.fn(), addTrackToPlaylist: vi.fn(), removeTrackFromPlaylist: vi.fn(),
    updateGame: vi.fn(), deleteGame: vi.fn(),
    bulkUpdateTracks: vi.fn().mockResolvedValue(result),
    selectFolder: vi.fn().mockResolvedValue(null), selectFiles: vi.fn().mockResolvedValue([]),
    selectImage: vi.fn().mockResolvedValue(null), openExplorer: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({ libraryPath: '', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25 }),
    setSetting: vi.fn().mockResolvedValue(undefined),
    onScanProgress: vi.fn().mockReturnValue(() => undefined),
    onPlayerStateChange: vi.fn().mockReturnValue(() => undefined),
    onPlayerTimeUpdate: vi.fn().mockReturnValue(() => undefined),
    onPlayerError: vi.fn().mockReturnValue(() => undefined),
  };
  return window.galMusic;
}

async function openSourceGame() {
  render(<App />);
  fireEvent.click(await screen.findByTestId('game-item-game-1'));
  await screen.findByRole('checkbox', { name: '选择 Track 1' });
}

function selectFirstTwo() {
  fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 2' }));
  expect(screen.getByText('已选择 2 首')).toBeInTheDocument();
}

describe('bulk track operations', () => {
  beforeEach(() => {
    installApi();
    useLibraryStore.getState().reset();
    usePlayerStore.getState().reset();
    useUiStore.getState().reset();
  });

  afterEach(() => cleanup());

  it('enables selection only in a concrete game and sends favorite changes in one request', async () => {
    const api = installApi();
    render(<App />);
    await screen.findByTestId('track-row-track-1');
    expect(screen.queryByRole('checkbox', { name: '选择 Track 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('game-item-game-1'));
    await screen.findByRole('checkbox', { name: '选择 Track 1' });
    selectFirstTwo();
    fireEvent.click(screen.getByRole('button', { name: '收藏所选曲目' }));

    await waitFor(() => expect(api.bulkUpdateTracks).toHaveBeenCalledTimes(1));
    expect(api.bulkUpdateTracks).toHaveBeenLastCalledWith({
      sourceGameId: 'game-1', trackIds: ['track-1', 'track-2'],
      operation: { type: 'favorite', isFavorite: true },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '取消收藏所选曲目' }));
    await waitFor(() => expect(api.bulkUpdateTracks).toHaveBeenCalledTimes(2));
    expect(api.bulkUpdateTracks).toHaveBeenLastCalledWith({
      sourceGameId: 'game-1', trackIds: ['track-1'],
      operation: { type: 'favorite', isFavorite: false },
    });
  });

  it('moves only to another game and adds all selected tracks to one playlist', async () => {
    const api = installApi();
    await openSourceGame();
    selectFirstTwo();
    fireEvent.click(screen.getByRole('button', { name: '移动所选曲目' }));

    expect(screen.getByRole('dialog', { name: '移动到其他音乐文件夹' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Source Game' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Target Game' }));
    await waitFor(() => expect(api.bulkUpdateTracks).toHaveBeenLastCalledWith({
      sourceGameId: 'game-1', trackIds: ['track-1', 'track-2'], operation: { type: 'move', targetGameId: 'game-2' },
    }));

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '加入播放列表' }));
    fireEvent.click(screen.getByRole('button', { name: '夜间播放' }));
    await waitFor(() => expect(api.bulkUpdateTracks).toHaveBeenLastCalledWith({
      sourceGameId: 'game-1', trackIds: ['track-1'], operation: { type: 'playlist-add', playlistId: 'playlist-1' },
    }));
  });

  it.each([
    ['保留硬盘文件', false],
    ['删除硬盘文件', true],
  ] as const)('offers the explicit delete mode “%s”', async (buttonName, deleteFiles) => {
    const api = installApi({ succeededIds: ['track-1'], failures: [] });
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '删除所选曲目' }));

    expect(screen.getByRole('button', { name: '保留硬盘文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除硬盘文件' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    await waitFor(() => expect(api.bulkUpdateTracks).toHaveBeenCalledWith({
      sourceGameId: 'game-1', trackIds: ['track-1'], operation: { type: 'delete', deleteFiles },
    }));
  });

  it('retains only failed selections and reports a partial result', async () => {
    installApi({ succeededIds: ['track-1'], failures: [{ trackId: 'track-2', userMessage: '文件被占用' }] });
    await openSourceGame();
    selectFirstTwo();
    fireEvent.click(screen.getByRole('button', { name: '收藏所选曲目' }));

    expect(await screen.findByText('成功 1 首，失败 1 首')).toBeInTheDocument();
    expect(screen.getByText('Track 2：文件被占用')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '选择 Track 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 Track 2' })).toBeChecked();
  });

  it('shows at most three detailed failures and reports how many remain', async () => {
    installApi({
      succeededIds: ['track-5'],
      failures: [
        { trackId: 'track-1', userMessage: '原因一' },
        { trackId: 'track-2', userMessage: '原因二' },
        { trackId: 'track-3', userMessage: '原因三' },
        { trackId: 'track-4', userMessage: '原因四' },
      ],
    });
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择当前全部曲目' }));
    fireEvent.click(screen.getByRole('button', { name: '收藏所选曲目' }));

    expect(await screen.findByText('Track 1：原因一')).toBeInTheDocument();
    expect(screen.getByText('Track 2：原因二')).toBeInTheDocument();
    expect(screen.getByText('Track 3：原因三')).toBeInTheDocument();
    expect(screen.queryByText('Track 4：原因四')).not.toBeInTheDocument();
    expect(screen.getByText('另有 1 首失败曲目')).toBeInTheDocument();
  });

  it('clears an old result summary when the selection context changes', async () => {
    installApi({ succeededIds: ['track-1'], failures: [] });
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '收藏所选曲目' }));
    expect(await screen.findByText('成功 1 首，失败 0 首')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new context' } });
    await waitFor(() => expect(screen.queryByText('成功 1 首，失败 0 首')).not.toBeInTheDocument());
  });

  it('clears selection after search, category, game, or section changes', async () => {
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'opening' } });
    await waitFor(() => expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '语音' }));
    await waitFor(() => expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByTestId('game-item-game-2'));
    await waitFor(() => expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByTestId('sidebar-nav-recent'));
    await waitFor(() => expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument());
  });

  it('blocks duplicate submissions while one bulk request is running', async () => {
    let resolveRequest!: (result: BulkTrackResult) => void;
    const api = installApi();
    vi.mocked(api.bulkUpdateTracks).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    const favorite = screen.getByRole('button', { name: '收藏所选曲目' });
    fireEvent.click(favorite);
    fireEvent.click(favorite);
    expect(api.bulkUpdateTracks).toHaveBeenCalledTimes(1);
    expect(favorite).toBeDisabled();
    resolveRequest({ succeededIds: ['track-1'], failures: [] });
    await waitFor(() => expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument());
  });

  it('does not restore stale bulk UI when a deferred request resolves in a new context', async () => {
    let resolveRequest!: (result: BulkTrackResult) => void;
    const api = installApi();
    vi.mocked(api.bulkUpdateTracks).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '移动所选曲目' }));
    fireEvent.click(screen.getByRole('button', { name: 'Target Game' }));
    expect(api.bulkUpdateTracks).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new context' } });
    expect(screen.queryByRole('dialog', { name: '移动到其他音乐文件夹' })).not.toBeInTheDocument();
    resolveRequest({ succeededIds: [], failures: [{ trackId: 'track-1', userMessage: '旧请求失败' }] });

    await waitFor(() => expect(screen.getByRole('checkbox', { name: '选择 Track 1' })).not.toBeDisabled());
    expect(screen.getByRole('checkbox', { name: '选择 Track 1' })).not.toBeChecked();
    expect(screen.queryByText('成功 0 首，失败 1 首')).not.toBeInTheDocument();
    expect(screen.queryByText('Track 1：旧请求失败')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '移动到其他音乐文件夹' })).not.toBeInTheDocument();
  });

  it('reconciles a successfully moved current track to its authoritative new path', async () => {
    const api = installApi({ succeededIds: ['track-1'], failures: [] });
    const movedTrack = {
      ...tracks[0],
      gameId: 'game-2',
      gameName: 'Target Game',
      filePath: 'C:/Music/Target Game/音乐/track-1.ogg',
    };
    vi.mocked(api.getTracks).mockImplementation(async (query) => (
      typeof query === 'object' && query?.gameId === 'game-2' ? [movedTrack] : tracks
    ));
    usePlayerStore.getState().setPlaylist([tracks[0], tracks[1]]);

    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '移动所选曲目' }));
    fireEvent.click(screen.getByRole('button', { name: 'Target Game' }));

    await waitFor(() => expect(usePlayerStore.getState().currentTrack?.filePath).toBe(movedTrack.filePath));
    expect(usePlayerStore.getState().playlist[0]).toEqual(movedTrack);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('safely clears the old playback path when target refresh fails after a successful move', async () => {
    const api = installApi({ succeededIds: ['track-1'], failures: [] });
    vi.mocked(api.getTracks).mockImplementation(async (query) => {
      if (typeof query === 'object' && query?.gameId === 'game-2') {
        throw new Error('target refresh unavailable');
      }
      return tracks;
    });
    usePlayerStore.getState().setPlaylist([tracks[0], tracks[1]]);

    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '移动所选曲目' }));
    fireEvent.click(screen.getByRole('button', { name: 'Target Game' }));

    expect(await screen.findByText('成功 1 首，失败 0 首')).toBeInTheDocument();
    expect(screen.getByText('移动已完成，但播放器刷新失败')).toBeInTheDocument();
    expect(screen.queryByText('已选择 1 首')).not.toBeInTheDocument();
    expect(usePlayerStore.getState().currentTrack).toBeNull();
    expect(usePlayerStore.getState().playlist).toEqual([]);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('stops and clears playback after the current track is successfully deleted', async () => {
    installApi({ succeededIds: ['track-1'], failures: [] });
    usePlayerStore.getState().setPlaylist([tracks[0], tracks[1]]);

    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '删除所选曲目' }));
    fireEvent.click(screen.getByRole('button', { name: '保留硬盘文件' }));

    await waitFor(() => expect(usePlayerStore.getState().currentTrack).toBeNull());
    expect(usePlayerStore.getState().playlist).toEqual([]);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('does not change playback when moving or deleting the current track fails', async () => {
    installApi({
      succeededIds: [],
      failures: [{ trackId: 'track-1', userMessage: '文件被占用' }],
    });
    usePlayerStore.getState().setPlaylist([tracks[0], tracks[1]]);
    const before = usePlayerStore.getState();

    await openSourceGame();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('button', { name: '删除所选曲目' }));
    fireEvent.click(screen.getByRole('button', { name: '保留硬盘文件' }));

    await screen.findByText('成功 0 首，失败 1 首');
    const after = usePlayerStore.getState();
    expect(after.currentTrack).toEqual(before.currentTrack);
    expect(after.playlist).toEqual(before.playlist);
    expect(after.isPlaying).toBe(before.isPlaying);
  });
});
