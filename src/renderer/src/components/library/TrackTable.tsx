import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { Track } from '../../../../shared/types';
import { TrackRow } from './TrackRow';
import { measureExternalTrackScroll } from './track-scroll';
import { calculateVirtualTrackWindow } from './virtual-track-window';

const TRACK_ROW_HEIGHT = 60;
const TRACK_LIST_FALLBACK_HEIGHT = 600;
const TRACK_LIST_OVERSCAN = 8;

export interface TrackTableProps {
  tracks: Track[];
  playingTrackId?: string | null;
  onPlayTrack?: (track: Track) => void;
  playTrack?: (track: Track) => void;
  onPlay?: (track: Track) => void;
  onTrackPlay?: (track: Track) => void;
  onRename?: (track: Track) => void;
  onDelete?: (track: Track) => void;
  onOpenFolder?: (track: Track) => void;
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  selectionEnabled?: boolean;
  selectedTrackIds?: ReadonlySet<string>;
  onSelectionChange?: (next: Set<string>) => void;
  selectionDisabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function TrackTable({
  tracks,
  playingTrackId = null,
  onPlayTrack,
  playTrack,
  onPlay,
  onTrackPlay,
  onRename,
  onDelete,
  onOpenFolder,
  onToggleFavorite,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  selectionEnabled = false,
  selectedTrackIds = new Set<string>(),
  onSelectionChange,
  selectionDisabled = false,
  scrollContainerRef,
}: TrackTableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const lastSelectionIndexRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(TRACK_LIST_FALLBACK_HEIGHT);
  const trackOrderKey = useMemo(
    () => tracks.map((track) => track.id).join('\u0000'),
    [tracks],
  );
  const virtualWindow = calculateVirtualTrackWindow({
    itemCount: tracks.length,
    rowHeight: TRACK_ROW_HEIGHT,
    viewportHeight,
    scrollTop,
    overscan: TRACK_LIST_OVERSCAN,
  });
  const visibleTracks = tracks.slice(virtualWindow.startIndex, virtualWindow.endIndex);
  const selectedCount = useMemo(
    () => tracks.reduce(
      (count, track) => count + (selectedTrackIds.has(track.id) ? 1 : 0),
      0,
    ),
    [tracks, selectedTrackIds],
  );
  const allSelected = tracks.length > 0 && selectedCount === tracks.length;
  const partiallySelected = selectedCount > 0 && !allSelected;
  const columnCount = selectionEnabled ? 7 : 6;

  useLayoutEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  useEffect(() => {
    const tableScroller = scrollerRef.current;
    const outerScroller = scrollContainerRef?.current;
    const scrollTarget = outerScroller ?? tableScroller;
    if (!tableScroller || !scrollTarget) return undefined;

    const updateScrollMetrics = () => {
      if (outerScroller) {
        const metrics = measureExternalTrackScroll(
          outerScroller,
          tableScroller,
          TRACK_LIST_FALLBACK_HEIGHT,
        );
        setScrollTop(metrics.scrollTop);
        setViewportHeight(metrics.viewportHeight);
        return;
      }
      setScrollTop(tableScroller.scrollTop);
      setViewportHeight(tableScroller.clientHeight || TRACK_LIST_FALLBACK_HEIGHT);
    };

    updateScrollMetrics();
    scrollTarget.addEventListener('scroll', updateScrollMetrics, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      return () => scrollTarget.removeEventListener('scroll', updateScrollMetrics);
    }
    const observer = new ResizeObserver(updateScrollMetrics);
    observer.observe(scrollTarget);
    observer.observe(tableScroller);
    return () => {
      scrollTarget.removeEventListener('scroll', updateScrollMetrics);
      observer.disconnect();
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    const scrollTarget = scrollContainerRef?.current ?? scrollerRef.current;
    if (scrollTarget) scrollTarget.scrollTop = 0;
    setScrollTop(0);
    lastSelectionIndexRef.current = null;
  }, [scrollContainerRef, trackOrderKey]);

  const toggleAllTracks = () => {
    if (selectionDisabled || !onSelectionChange) return;
    const next = new Set(selectedTrackIds);
    tracks.forEach((track) => {
      if (allSelected) next.delete(track.id);
      else next.add(track.id);
    });
    lastSelectionIndexRef.current = null;
    onSelectionChange(next);
  };

  const toggleTrack = (trackIndex: number, shiftKey: boolean) => {
    if (selectionDisabled || !onSelectionChange) return;
    const track = tracks[trackIndex];
    if (!track) return;

    const next = new Set(selectedTrackIds);
    const shouldSelect = !selectedTrackIds.has(track.id);
    const lastIndex = lastSelectionIndexRef.current;
    if (shiftKey && lastIndex !== null) {
      const start = Math.min(lastIndex, trackIndex);
      const end = Math.max(lastIndex, trackIndex);
      for (let index = start; index <= end; index += 1) {
        if (shouldSelect) next.add(tracks[index].id);
        else next.delete(tracks[index].id);
      }
    } else if (shouldSelect) {
      next.add(track.id);
    } else {
      next.delete(track.id);
    }
    lastSelectionIndexRef.current = trackIndex;
    onSelectionChange(next);
  };

  return (
    <div
      ref={scrollerRef}
      className="track-table-wrap"
      data-testid="track-table"
      onScroll={(event) => {
        if (!scrollContainerRef?.current) setScrollTop(event.currentTarget.scrollTop);
      }}
    >
      <table className={`track-table${selectionEnabled ? ' track-table--selectable' : ''}`}>
        <caption className="sr-only">曲目列表</caption>
        <thead className="track-table__head">
          <tr>
            {selectionEnabled && (
              <th scope="col" className="track-table__selection">
                <input
                  ref={selectAllRef}
                  className="track-selection-checkbox"
                  type="checkbox"
                  aria-label="选择当前全部曲目"
                  checked={allSelected}
                  disabled={selectionDisabled || tracks.length === 0}
                  readOnly
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleAllTracks();
                  }}
                />
              </th>
            )}
            <th scope="col" className="track-table__index">#</th>
            <th scope="col">曲目</th>
            <th scope="col">格式</th>
            <th scope="col">时长</th>
            <th scope="col">大小</th>
            <th scope="col" className="track-table__actions"><span className="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {virtualWindow.topSpacerHeight > 0 && (
            <tr className="track-table__spacer" aria-hidden="true">
              <td colSpan={columnCount} style={{ height: virtualWindow.topSpacerHeight }} />
            </tr>
          )}
          {visibleTracks.map((track, visibleIndex) => {
            const index = virtualWindow.startIndex + visibleIndex;
            return (
            <TrackRow
              key={track.id}
              track={track}
              index={track.trackNumber || index + 1}
              isPlaying={track.id === playingTrackId}
              onPlayTrack={onPlayTrack ?? playTrack ?? onPlay ?? onTrackPlay}
              onRename={onRename}
              onDelete={onDelete}
              onOpenFolder={onOpenFolder}
              onToggleFavorite={onToggleFavorite}
              onAddToPlaylist={onAddToPlaylist}
              onRemoveFromPlaylist={onRemoveFromPlaylist}
              selectionEnabled={selectionEnabled}
              isSelected={selectedTrackIds.has(track.id)}
              selectionDisabled={selectionDisabled}
              onSelect={(event) => toggleTrack(index, event.shiftKey)}
            />
            );
          })}
          {virtualWindow.bottomSpacerHeight > 0 && (
            <tr className="track-table__spacer" aria-hidden="true">
              <td colSpan={columnCount} style={{ height: virtualWindow.bottomSpacerHeight }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
