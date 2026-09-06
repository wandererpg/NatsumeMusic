/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackTable } from '../../src/renderer/src/components/library/TrackTable';
import type { Track } from '../../src/shared/types';

function makeTrack(index: number): Track {
  return {
    id: `track-${index}`,
    gameId: 'game-1',
    gameName: 'Large Library',
    filePath: `C:/Music/track-${index}.ogg`,
    fileName: `track-${index}.ogg`,
    customName: null,
    displayName: `Track ${index}`,
    duration: 120,
    kind: 'music',
    format: 'ogg',
    fileSize: 1024,
    fileHash: `hash-${index}`,
    trackNumber: index + 1,
    isFavorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TrackTable virtualization', () => {
  afterEach(() => cleanup());

  it('mounts only the visible rows and updates them when scrolling', async () => {
    const tracks = Array.from({ length: 500 }, (_, index) => makeTrack(index));
    const onPlayTrack = vi.fn();
    render(<TrackTable tracks={tracks} onPlayTrack={onPlayTrack} />);

    expect(screen.getAllByTestId(/^track-row-/)).toHaveLength(18);
    fireEvent.doubleClick(screen.getByTestId('track-row-track-0'));
    expect(onPlayTrack).toHaveBeenCalledWith(tracks[0]);

    const scroller = screen.getByTestId('track-table');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 29_400 });
    fireEvent.scroll(scroller);

    await waitFor(() => expect(screen.getByTestId('track-row-track-499')).toBeInTheDocument());
    expect(screen.getAllByTestId(/^track-row-/).length).toBeLessThanOrEqual(26);
    expect(screen.queryByTestId('track-row-track-0')).not.toBeInTheDocument();
  });

  it('follows the outer library panel when the table is embedded in it', async () => {
    const tracks = Array.from({ length: 500 }, (_, index) => makeTrack(index));
    const outerScroller = document.createElement('main');
    Object.defineProperty(outerScroller, 'clientHeight', { configurable: true, value: 600 });
    Object.defineProperty(outerScroller, 'scrollTop', { configurable: true, writable: true, value: 0 });
    vi.spyOn(outerScroller, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600,
    } as DOMRect);
    const scrollContainerRef = { current: outerScroller };

    render(<TrackTable tracks={tracks} scrollContainerRef={scrollContainerRef} />);
    const tableScroller = screen.getByTestId('track-table');
    let tableTop = 0;
    vi.spyOn(tableScroller, 'getBoundingClientRect').mockImplementation(() => ({
      top: tableTop, bottom: tableTop + 600, left: 0, right: 800, width: 800, height: 600,
    } as DOMRect));

    outerScroller.scrollTop = 29_400;
    tableTop = -29_400;
    fireEvent.scroll(outerScroller);

    await waitFor(() => expect(screen.getByTestId('track-row-track-499')).toBeInTheDocument());
    expect(screen.queryByTestId('track-row-track-0')).not.toBeInTheDocument();
  });
});
