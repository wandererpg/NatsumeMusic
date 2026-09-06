export interface TrackScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
}

export function measureExternalTrackScroll(
  outerScroller: HTMLElement,
  trackTable: HTMLElement,
  fallbackHeight: number,
): TrackScrollMetrics {
  const outerRect = outerScroller.getBoundingClientRect();
  const tableRect = trackTable.getBoundingClientRect();
  const tableOffset = tableRect.top - outerRect.top + outerScroller.scrollTop;
  const scrollTop = Math.max(0, outerScroller.scrollTop - tableOffset);
  const visibleHeight = Math.min(
    outerScroller.clientHeight,
    Math.max(0, outerRect.bottom - tableRect.top),
  );

  return {
    scrollTop,
    viewportHeight: visibleHeight || fallbackHeight,
  };
}
