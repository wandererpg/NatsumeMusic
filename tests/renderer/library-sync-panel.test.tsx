/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibrarySyncPanel } from '../../src/renderer/src/components/settings/LibrarySyncPanel';
import { useLibraryStore } from '../../src/renderer/src/stores/libraryStore';
import type { GalMusicAPI } from '../../src/shared/ipc';
afterEach(() => { cleanup(); useLibraryStore.getState().reset(); vi.unstubAllGlobals(); });
function setup() {
  const api = { exportSyncPackage: vi.fn().mockResolvedValue({ manifestPath: 'D:/sync/manifest.json', tracks: 2, totalBytes: 10 }), previewSyncPackage: vi.fn().mockResolvedValue({ token: 'native-token', application: 'NatsumeNote', games: 1, tracks: 2, playlists: 1, newGames: 1, newTracks: 2, newPlaylists: 1, totalBytes: 10, conflictCount: 1, conflicts: [{ kind: 'track', name: '序曲' }] }), applySyncPackage: vi.fn().mockResolvedValue({ games: 1, tracks: 2, playlists: 1, updated: 0 }), getGames: vi.fn().mockResolvedValue([]), getTracks: vi.fn().mockResolvedValue([]), getPlaylists: vi.fn().mockResolvedValue([]) };
  window.galMusic = api as unknown as GalMusicAPI;
  return api;
}
it('previews without applying and merges only after explicit confirmation', async () => {
  const api = setup(); render(<LibrarySyncPanel />);
  fireEvent.click(screen.getByRole('button', { name: '选择同步包并预览' }));
  expect(await screen.findByText('来自 NatsumeNote 的同步包')).toBeInTheDocument();
  expect(api.applySyncPackage).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('同步冲突处理'), { target: { value: 'incoming' } });
  fireEvent.click(screen.getByRole('button', { name: '确认合并' }));
  await screen.findByText(/合并完成/);
  expect(api.applySyncPackage).toHaveBeenCalledOnce(); expect(api.applySyncPackage).toHaveBeenCalledWith('native-token', 'incoming');
  expect(api.getGames).toHaveBeenCalledOnce(); expect(api.getTracks).toHaveBeenCalledOnce();
});
it('shows serialized errors and prevents duplicate submissions while exporting', async () => {
  const api = setup(); let fail!: (error: unknown) => void;
  api.exportSyncPackage.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const busy = vi.fn(); render(<LibrarySyncPanel onBusyChange={busy} />);
  const button = screen.getByRole('button', { name: '导出同步文件夹' }); fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled(); expect(api.exportSyncPackage).toHaveBeenCalledOnce();
  await act(async () => fail({ userMessage: '空间不足' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('空间不足');
  await waitFor(() => expect(button).toBeEnabled()); expect(busy.mock.calls).toEqual([[true], [false]]);
});
