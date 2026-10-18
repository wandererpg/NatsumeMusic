/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdatePanel } from '../../src/renderer/src/components/settings/AppUpdatePanel';
import { SettingsPanel } from '../../src/renderer/src/components/settings/SettingsPanel';
import type { AppUpdateState } from '../../src/shared/types';

afterEach(cleanup);
it('reloads the current downloaded state when reopened and removes the listener on close', async () => {
  const unsubscribe = vi.fn();
  window.galMusic = { getUpdateState: vi.fn(async () => ({ currentVersion: '0.1.1', supported: true, status: 'downloaded', availableVersion: '0.1.2', canDownload: false, canInstall: true })), onUpdateState: vi.fn(() => unsubscribe) } as unknown as typeof window.galMusic;
  const view = render(<AppUpdatePanel />);
  expect(await screen.findByRole('button', { name: '重启更新' })).toBeEnabled();
  expect(screen.getByText(/0.1.1/)).toBeInTheDocument();
  view.unmount(); expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('uses progress events without resetting pending settings edits', async () => {
  let listener!: (state: AppUpdateState) => void;
  const state: AppUpdateState = { currentVersion: '0.1.1', supported: true, status: 'available', canDownload: true, canInstall: false };
  const download = vi.fn(async () => ({ ...state, status: 'downloading' as const }));
  window.galMusic = { getUpdateState: vi.fn(async () => state), onUpdateState: vi.fn((callback) => { listener = callback; return () => {}; }), downloadUpdate: download } as unknown as typeof window.galMusic;
  render(<AppUpdatePanel />);
  fireEvent.click(await screen.findByRole('button', { name: '下载更新' }));
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  listener({ ...state, status: 'downloading', progress: 67 });
  await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('value', '67'));
});
it('keeps the unsaved library folder when update events arrive in SettingsPanel', async () => {
  let listener!: (state: AppUpdateState) => void;
  const state: AppUpdateState = { currentVersion: '0.1.1', supported: true, status: 'idle', canDownload: false, canInstall: false };
  window.galMusic = { getUpdateState: vi.fn(async () => state), onUpdateState: vi.fn((callback) => { listener = callback; return () => {}; }) } as unknown as typeof window.galMusic;
  const save = vi.fn(async () => {});
  render(<SettingsPanel settings={{ libraryPath: 'C:/Old', volume: .8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 18.5, themeId: 'rain-afterglow', background: { imagePath: null, blur: 0, dim: .4, scale: 100, positionX: 50, positionY: 50 } }} onClose={vi.fn()} onSelectFolder={vi.fn(async () => 'C:/New')} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: '浏览' }));
  await screen.findByDisplayValue('C:/New');
  listener({ ...state, status: 'downloaded', canInstall: true });
  await screen.findByRole('button', { name: '重启更新' });
  expect(screen.getByDisplayValue('C:/New')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ libraryPath: 'C:/New' })));
});

