/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackLoadingState } from '../../src/renderer/src/components/library/TrackLoadingState';

describe('track loading feedback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('announces loading immediately and shows a spinner only for a longer wait', () => {
    render(<TrackLoadingState />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('正在读取曲目…')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(140));
    expect(screen.getByText('正在读取曲目…')).toBeInTheDocument();
  });

  it('does not flash a spinner for a fast request and clears the pending timer', () => {
    const { unmount } = render(<TrackLoadingState />);
    act(() => vi.advanceTimersByTime(60));
    expect(screen.queryByText('正在读取曲目…')).not.toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
