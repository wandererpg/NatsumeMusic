/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/renderer/src/App';
import { useLibraryStore } from '../../src/renderer/src/stores/libraryStore';
import { usePlayerStore } from '../../src/renderer/src/stores/playerStore';
import { useUiStore } from '../../src/renderer/src/stores/uiStore';

describe('app appearance integration', () => {
  const setSetting = vi.fn().mockResolvedValue(undefined);
  const saveSettings = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    setSetting.mockClear();
    saveSettings.mockClear();
    window.galMusic = {
      startScan: vi.fn(), cancelScan: vi.fn(), addTracks: vi.fn(),
      getGames: vi.fn().mockResolvedValue([]), getTracks: vi.fn().mockResolvedValue([]),
      updateTrack: vi.fn(), deleteTrack: vi.fn(), bulkUpdateTracks: vi.fn(), search: vi.fn(),
      getPlaylists: vi.fn().mockResolvedValue([]), createPlaylist: vi.fn(), deletePlaylist: vi.fn(),
      addTrackToPlaylist: vi.fn(), removeTrackFromPlaylist: vi.fn(), updateGame: vi.fn(), deleteGame: vi.fn(),
      selectFolder: vi.fn().mockResolvedValue(null), selectFiles: vi.fn().mockResolvedValue([]),
      selectImage: vi.fn().mockResolvedValue('D:/Pictures/scene.png'), openExplorer: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
        themeId: 'amber-film',
        background: { imagePath: 'D:/Pictures/scene.png', blur: 14, dim: 0.5, scale: 120, positionX: 40, positionY: 65 },
      }),
      setSetting,
      saveSettings,
      cancelAppearancePreview: vi.fn().mockResolvedValue(undefined),
      onScanProgress: vi.fn().mockReturnValue(() => undefined),
      onPlayerStateChange: vi.fn().mockReturnValue(() => undefined),
      onPlayerTimeUpdate: vi.fn().mockReturnValue(() => undefined),
      onPlayerError: vi.fn().mockReturnValue(() => undefined),
    } as unknown as typeof window.galMusic;
    useLibraryStore.getState().reset();
    usePlayerStore.getState().reset();
    useUiStore.getState().reset();
  });

  afterEach(() => cleanup());

  it('loads, previews, and persists one theme with the shared background unchanged', async () => {
    render(<App />);
    const shell = await screen.findByTestId('app-shell');
    await waitFor(() => expect(shell).toHaveAttribute('data-theme', 'amber-film'));
    expect(shell.getAttribute('style')).toContain('--user-background-position: 40% 65%');

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(await screen.findByRole('radio', { name: /霓虹终端/ }));
    expect(shell).toHaveAttribute('data-theme', 'neon-terminal');

    fireEvent.click(screen.getByRole('button', { name: /保存设置/ }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      themeId: 'neon-terminal',
      background: { imagePath: 'D:/Pictures/scene.png', blur: 14, dim: 0.5, scale: 120, positionX: 40, positionY: 65 },
    })));
    expect(setSetting).not.toHaveBeenCalledWith('background_image_path', expect.anything());
  });

  it('previews and persists a global primary font color override', async () => {
    render(<App />);
    const shell = await screen.findByTestId('app-shell');
    await waitFor(() => expect(shell).toHaveAttribute('data-theme', 'amber-film'));

    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.change(screen.getByLabelText('主要文字颜色'), { target: { value: '#ff77aa' } });
    expect(shell.getAttribute('style')).toContain('--paper-0: #ff77aa');

    fireEvent.click(screen.getByRole('button', { name: /保存设置/ }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontColor: '#ff77aa' })));
  });

  it('keeps the import completion result open so metadata and cover status are visible', async () => {
    let receiveScanResult: ((event: unknown) => void) | undefined;
    window.galMusic = {
      ...window.galMusic,
      onScanResult: vi.fn((listener: (event: unknown) => void) => {
        receiveScanResult = listener;
        return () => undefined;
      }),
    } as unknown as typeof window.galMusic;

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '从文件夹导入' }));
    await waitFor(() => expect(receiveScanResult).toEqual(expect.any(Function)));

    await act(async () => {
      receiveScanResult?.({
        requestId: 'scan-1',
        result: { found: 1, extracted: 0, copied: 1, skipped: 0, errors: [], metadata: {
          gameId: 'g1',
          coverSource: 'bangumi',
          sources: [
            { source: 'vndb', status: 'failed', queryName: 'ATRI', externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: 'VNDB 400' },
            { source: 'bangumi', status: 'matched', queryName: 'ATRI', externalId: '100', title: 'ATRI', titleCn: 'ATRI', developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null },
          ],
        } },
      });
    });

    expect(await screen.findByTestId('scan-result-metadata')).toBeInTheDocument();
    expect(screen.getByText('封面：已添加（Bangumi）')).toBeInTheDocument();
  });

  it('refreshes the game card after metadata lookup downloads a cover', async () => {
    const game = {
      id: 'g1', name: 'ATRI', coverPath: null, coverSource: null, folderPath: 'C:/Music/ATRI', trackCount: 1,
      createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
    } as const;
    const refreshedGame = { ...game, coverPath: 'C:/Music/ATRI/.cover.jpg', coverSource: 'bangumi' as const };
    const getGames = vi.fn().mockResolvedValueOnce([game]).mockResolvedValue([refreshedGame]);
    window.galMusic = {
      ...window.galMusic,
      getGames,
      getGameMetadata: vi.fn().mockResolvedValue({
        gameId: 'g1',
        coverSource: 'bangumi',
        sources: [
          { source: 'vndb', status: 'no_match', queryName: 'ATRI', externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null },
          { source: 'bangumi', status: 'matched', queryName: 'ATRI', externalId: '100', title: 'ATRI', titleCn: 'ATRI', developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null },
        ],
      }),
    } as unknown as typeof window.galMusic;

    render(<App />);
    fireEvent.click(await screen.findByTestId('edit-game-g1'));

    expect(await screen.findByAltText('游戏封面预览')).toHaveAttribute('src', expect.stringContaining('galmusic-cover://'));
  });
});
