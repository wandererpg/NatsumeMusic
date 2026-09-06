export interface VirtualTrackWindowInput {
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan: number;
}

export interface VirtualTrackWindow {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
}

export function calculateVirtualTrackWindow({
  itemCount,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan,
}: VirtualTrackWindowInput): VirtualTrackWindow {
  const count = Math.max(0, Math.floor(itemCount));
  const height = Math.max(1, rowHeight);
  const viewport = Math.max(0, viewportHeight);
  const offset = Math.max(0, scrollTop);
  const buffer = Math.max(0, Math.floor(overscan));
  const totalHeight = count * height;
  const visibleStart = Math.min(count, Math.floor(offset / height));
  const visibleEnd = Math.min(count, Math.ceil((offset + viewport) / height));
  const startIndex = Math.max(0, visibleStart - buffer);
  const endIndex = Math.min(count, visibleEnd + buffer);

  return {
    startIndex,
    endIndex,
    topSpacerHeight: startIndex * height,
    bottomSpacerHeight: Math.max(0, totalHeight - endIndex * height),
    totalHeight,
  };
}
