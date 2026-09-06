/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayerBar } from '../../src/renderer/src/components/layout/PlayerBar';
import type { Track } from '../../src/shared/types';

const track: Track = {
  id: 'track-1',
  gameId: 'game-1',
  gameName: 'ATRI -My Dear Moments-',
  filePath: 'C:/Music/ATRI/01_Opening.ogg',
  fileName: '01_Opening.ogg',
  customName: null,
  displayName: '桜の詩',
  duration: 185.25,
  kind: 'music',
  format: 'ogg',
  fileSize: 128,
  fileHash: 'h1',
  trackNumber: 1,
  isFavorite: false,
  createdAt: '',
  updatedAt: '',
};

describe('PlayerBar', () => {
  afterEach(() => cleanup());
  it('shows the work and duration, animates the active fill, and seeks by dragging', () => {
    const onSeek = vi.fn();
    const view = render(
      <PlayerBar
        playerState={{
          currentTrack: track,
          isPlaying: true,
          volume: 0.8,
          progress: 0.4,
          duration: 185.25,
          currentTime: 74,
          playMode: 'list-loop',
        }}
        onSeek={onSeek}
      />,
    );

    expect(screen.getByText('ATRI -My Dear Moments-')).toBeInTheDocument();
    expect(screen.getAllByText('3:05').length).toBeGreaterThanOrEqual(1);
    const fill = screen.getByTestId('player-progress-fill');
    expect(fill).toHaveStyle({ width: '40%' });
    expect(fill).toHaveClass('is-playing');

    const range = view.getByRole('slider', { name: '播放进度' });
    fireEvent.change(range, { target: { value: '62.5' } });
    expect(onSeek).toHaveBeenCalledWith(62.5);
  });

  it('supports precise keyboard seeking and exposes a visible seek thumb', () => {
    const onSeek = vi.fn();
    render(
      <PlayerBar
        playerState={{ currentTrack: track, progress: 0.4, duration: 200, currentTime: 80 }}
        onSeek={onSeek}
      />,
    );

    const range = screen.getByRole('slider', { name: '播放进度' });
    expect(range).toHaveClass('progress-range');
    fireEvent.keyDown(range, { key: 'ArrowRight' });
    fireEvent.keyDown(range, { key: 'ArrowLeft' });
    fireEvent.keyDown(range, { key: 'Home' });
    fireEvent.keyDown(range, { key: 'End' });

    expect(onSeek).toHaveBeenNthCalledWith(1, 42.5);
    expect(onSeek).toHaveBeenNthCalledWith(2, 37.5);
    expect(onSeek).toHaveBeenNthCalledWith(3, 0);
    expect(onSeek).toHaveBeenNthCalledWith(4, 100);
  });
});
