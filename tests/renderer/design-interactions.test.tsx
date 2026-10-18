/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TitleBar } from '../../src/renderer/src/components/layout/TitleBar';
import { GameShelf } from '../../src/renderer/src/components/library/GameShelf';
import { SettingsPanel } from '../../src/renderer/src/components/settings/SettingsPanel';
import { PlayerBar } from '../../src/renderer/src/components/layout/PlayerBar';
import type { AppSettings, Game } from '../../src/shared/types';

const settings: AppSettings = {
  libraryPath: 'C:/Music', volume: .8, playMode: 'list-loop', lastTrackId: null,
  voiceThresholdSeconds: 25, themeId: 'rain-afterglow', fontColor: null,
  background: { imagePath: null, blur: 12, dim: .42, scale: 100, positionX: 50, positionY: 50 },
};
const games: Game[] = [{ id: 'one', name: 'Summer Pockets', coverPath: null, coverSource: null, trackCount: 12, createdAt: '', updatedAt: '' }];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('music archive interactions', () => {
  it('focuses search with Ctrl+K and clears it with Escape or the clear button', () => {
    function Search() {
      const [text, setText] = useState('夏日');
      return <TitleBar searchText={text} onSearchChange={setText} />;
    }
    render(<Search />);
    const input = screen.getByRole('searchbox');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '原声' } });
    fireEvent.click(screen.getByRole('button', { name: '清除搜索关键词' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('keeps Tab within settings, ignores global search, and restores focus on Escape', async () => {
    function Settings() {
      const [open, setOpen] = useState(false);
      return <><TitleBar onSettingsClick={() => setOpen(true)} />{open && <SettingsPanel settings={settings} onSave={vi.fn()} onClose={() => setOpen(false)} />}</>;
    }
    render(<Settings />);
    const trigger = screen.getByRole('button', { name: '设置' });
    trigger.focus();
    fireEvent.click(trigger);
    const close = screen.getByRole('button', { name: '关闭设置' });
    const save = screen.getByRole('button', { name: '保存设置' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('does not dismiss settings while a save is in progress', async () => {
    const onClose = vi.fn();
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<SettingsPanel settings={settings} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('enables shelf arrows according to overflow and honors reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<GameShelf games={games} onSelectGame={vi.fn()} />);
    const list = screen.getByLabelText('作品封面列表，可横向滚动');
    const next = screen.getByRole('button', { name: '向后浏览作品' });
    const previous = screen.getByRole('button', { name: '向前浏览作品' });
    expect(next).toBeDisabled();
    Object.defineProperties(list, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;
    fireEvent.scroll(list);
    expect(next).toBeEnabled();
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'auto' });
    list.scrollLeft = 600;
    fireEvent.scroll(list);
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
  });

  it('disables transport controls until a track is selected', () => {
    const toggle = vi.fn();
    render(<PlayerBar onTogglePlay={toggle} />);
    for (const name of ['上一首', '播放', '下一首']) expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByRole('slider', { name: '播放进度' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(toggle).not.toHaveBeenCalled();
  });
});
