import { describe, expect, it } from 'vitest';

import { calculateVirtualTrackWindow } from '../../src/renderer/src/components/library/virtual-track-window';

describe('calculateVirtualTrackWindow', () => {
  it('renders the visible rows plus overscan at the top of a large list', () => {
    expect(calculateVirtualTrackWindow({
      itemCount: 5_000,
      rowHeight: 60,
      viewportHeight: 600,
      scrollTop: 0,
      overscan: 8,
    })).toEqual({
      startIndex: 0,
      endIndex: 18,
      topSpacerHeight: 0,
      bottomSpacerHeight: 298_920,
      totalHeight: 300_000,
    });
  });

  it('clamps the window and spacers at the bottom of the list', () => {
    expect(calculateVirtualTrackWindow({
      itemCount: 5_000,
      rowHeight: 60,
      viewportHeight: 600,
      scrollTop: 299_400,
      overscan: 8,
    })).toEqual({
      startIndex: 4_982,
      endIndex: 5_000,
      topSpacerHeight: 298_920,
      bottomSpacerHeight: 0,
      totalHeight: 300_000,
    });
  });
});
