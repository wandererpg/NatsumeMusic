/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrackTable } from '../../src/renderer/src/components/library/TrackTable';
import type { Track } from '../../src/shared/types';

function makeTrack(index: number): Track {
  return {
    id: `track-${index}`,
    gameId: 'game-1',
    gameName: 'Selection Game',
    filePath: `C:/Music/track-${index}.ogg`,
    fileName: `track-${index}.ogg`,
    customName: null,
    displayName: `Track ${index + 1}`,
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

function SelectionHarness({
  tracks,
  disabled = false,
  onPlayTrack,
}: {
  tracks: Track[];
  disabled?: boolean;
  onPlayTrack?: (track: Track) => void;
}) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  return (
    <TrackTable
      tracks={tracks}
      onPlayTrack={onPlayTrack}
      selectionEnabled
      selectionDisabled={disabled}
      selectedTrackIds={selectedTrackIds}
      onSelectionChange={setSelectedTrackIds}
    />
  );
}

describe('TrackTable controlled selection', () => {
  afterEach(() => cleanup());

  it('selects one row and uses the full track order for a Shift range', () => {
    const tracks = Array.from({ length: 8 }, (_, index) => makeTrack(index));
    render(<SelectionHarness tracks={tracks} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 4' }), { shiftKey: true });

    for (let index = 0; index < 4; index += 1) {
      expect(screen.getByRole('checkbox', { name: `选择 Track ${index + 1}` })).toBeChecked();
    }
    expect(screen.getByRole('checkbox', { name: '选择 Track 5' })).not.toBeChecked();
  });

  it('selects only the tracks passed to the table and exposes the partial state', () => {
    const tracks = Array.from({ length: 5 }, (_, index) => makeTrack(index));
    render(<SelectionHarness tracks={tracks} />);

    const selectAll = screen.getByRole('checkbox', { name: '选择当前全部曲目' }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 2' }));
    expect(selectAll.indeterminate).toBe(true);
    expect(selectAll).not.toBeChecked();

    fireEvent.click(selectAll);
    tracks.forEach((track) => {
      expect(screen.getByRole('checkbox', { name: `选择 ${track.displayName}` })).toBeChecked();
    });

    fireEvent.click(selectAll);
    tracks.forEach((track) => {
      expect(screen.getByRole('checkbox', { name: `选择 ${track.displayName}` })).not.toBeChecked();
    });
  });

  it('keeps controlled selections while virtual rows unmount and remounts at most 26 rows', async () => {
    const tracks = Array.from({ length: 100 }, (_, index) => makeTrack(index));
    render(<SelectionHarness tracks={tracks} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 1' }));
    const scroller = screen.getByTestId('track-table');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 5_400 });
    fireEvent.scroll(scroller);

    await waitFor(() => expect(screen.getByRole('checkbox', { name: '选择 Track 100' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 100' }), { shiftKey: true });
    expect(screen.getAllByTestId(/^track-row-/).length).toBeLessThanOrEqual(26);

    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 0 });
    fireEvent.scroll(scroller);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '选择 Track 1' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: '选择 Track 8' })).toBeChecked();
  });

  it('does not play from checkbox interaction and disables all selection controls when requested', () => {
    const tracks = [makeTrack(0)];
    const onPlayTrack = vi.fn();
    const { rerender } = render(<SelectionHarness tracks={tracks} onPlayTrack={onPlayTrack} />);

    const checkbox = screen.getByRole('checkbox', { name: '选择 Track 1' });
    fireEvent.doubleClick(checkbox);
    expect(onPlayTrack).not.toHaveBeenCalled();

    rerender(<SelectionHarness tracks={tracks} disabled onPlayTrack={onPlayTrack} />);
    expect(screen.getByRole('checkbox', { name: '选择 Track 1' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '选择当前全部曲目' })).toBeDisabled();
  });

  it('uses seven columns for virtual spacers only when selection is enabled', async () => {
    const tracks = Array.from({ length: 100 }, (_, index) => makeTrack(index));
    const { rerender } = render(<SelectionHarness tracks={tracks} />);
    const scroller = screen.getByTestId('track-table');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 1_200 });
    fireEvent.scroll(scroller);

    await waitFor(() => {
      const spacerCell = document.querySelector('.track-table__spacer td');
      expect(spacerCell).toHaveAttribute('colspan', '7');
    });

    rerender(<TrackTable tracks={tracks} />);
    expect(document.querySelector('.track-table__spacer td')).toHaveAttribute('colspan', '6');
  });

  it('does not rescan the full selection set when only the virtual scroll position changes', async () => {
    const tracks = Array.from({ length: 500 }, (_, index) => makeTrack(index));
    const selectedTrackIds = new Set<string>(['track-0']);
    const has = vi.spyOn(selectedTrackIds, 'has');
    render(
      <TrackTable
        tracks={tracks}
        selectionEnabled
        selectedTrackIds={selectedTrackIds}
        onSelectionChange={vi.fn()}
      />,
    );
    const callsAfterMount = has.mock.calls.length;

    const scroller = screen.getByTestId('track-table');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 12_000 });
    fireEvent.scroll(scroller);
    await waitFor(() => expect(screen.getByTestId('track-row-track-200')).toBeInTheDocument());

    expect(has.mock.calls.length - callsAfterMount).toBeLessThanOrEqual(100);
  });

  it('resets the Shift anchor when middle rows reorder even if the first and last IDs stay unchanged', () => {
    const tracks = Array.from({ length: 5 }, (_, index) => makeTrack(index));
    const { rerender } = render(<SelectionHarness tracks={tracks} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 2' }));

    const reordered = [tracks[0], tracks[2], tracks[3], tracks[1], tracks[4]];
    rerender(<SelectionHarness tracks={reordered} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 Track 4' }), { shiftKey: true });

    expect(screen.getByRole('checkbox', { name: '选择 Track 2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 Track 4' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 Track 3' })).not.toBeChecked();
  });

  it('keeps the scroll position when track metadata changes without changing the ID order', async () => {
    const tracks = Array.from({ length: 100 }, (_, index) => makeTrack(index));
    const { rerender } = render(<TrackTable tracks={tracks} />);
    const scroller = screen.getByTestId('track-table');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 1_200 });
    fireEvent.scroll(scroller);
    await waitFor(() => expect(screen.getByTestId('track-row-track-20')).toBeInTheDocument());

    rerender(<TrackTable tracks={tracks.map((track) => ({ ...track, isFavorite: true }))} />);
    expect(scroller.scrollTop).toBe(1_200);
    expect(screen.getByTestId('track-row-track-20')).toBeInTheDocument();
  });
});
