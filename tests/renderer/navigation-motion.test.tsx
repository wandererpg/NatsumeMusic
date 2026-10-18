/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const animations = vi.hoisted(() => [] as Array<{ revert: ReturnType<typeof vi.fn> }>);
vi.mock('animejs', () => ({
  animate: vi.fn(() => {
    const animation = { revert: vi.fn() };
    animations.push(animation);
    return animation;
  }),
}));
import { useNavigationMotion } from '../../src/renderer/src/hooks/useNavigationMotion';

const committed = vi.fn();
function Navigation() {
  const ref = useRef<HTMLElement>(null);
  const [view, setView] = useState('library');
  const navigate = useNavigationMotion(ref, view);
  return <div className="app-shell" data-input-modality="pointer" data-testid="shell">
    {['library', 'favorites', 'recent'].map(destination => <button key={destination} onClick={() => navigate(destination, () => {
      committed(destination);
      setView(destination);
    })}>{destination}</button>)}
    <main ref={ref}><div className="library-view" key={view} data-testid="view">{view}</div></main>
  </div>;
}

describe('interruptible navigation', () => {
  let preference: MediaQueryList;
  let preferenceChanged: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    committed.mockClear();
    animations.length = 0;
    preference = {
      matches: false,
      addEventListener: vi.fn((_event, handler) => { preferenceChanged = handler; }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps only the latest destination and releases the exiting view', () => {
    render(<Navigation />);
    const oldView = screen.getByTestId('view');
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    expect(oldView.inert).toBe(true);
    act(() => vi.advanceTimersByTime(35));
    fireEvent.click(screen.getByRole('button', { name: 'recent' }));
    act(() => vi.advanceTimersByTime(70));
    expect(committed.mock.calls).toEqual([['recent']]);
    expect(screen.getByTestId('view')).toHaveTextContent('recent');
    expect(oldView.inert).toBe(false);
    expect(animations[0].revert).toHaveBeenCalled();
  });

  it('cancels an exit when the user chooses the current page again', () => {
    render(<Navigation />);
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'library' }));
    act(() => vi.runAllTimers());
    expect(committed.mock.calls).toEqual([['library']]);
    expect(screen.getByTestId('view').inert).toBe(false);
  });

  it('allows a new destination during entrance without waiting for completion', () => {
    render(<Navigation />);
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    act(() => vi.advanceTimersByTime(70));
    fireEvent.click(screen.getByRole('button', { name: 'recent' }));
    act(() => vi.advanceTimersByTime(70));
    expect(screen.getByTestId('view')).toHaveTextContent('recent');
    expect(animations[1].revert).toHaveBeenCalled();
  });

  it('commits keyboard and reduced-motion navigation immediately', () => {
    render(<Navigation />);
    screen.getByTestId('shell').dataset.inputModality = 'keyboard';
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    expect(screen.getByTestId('view')).toHaveTextContent('favorites');
    screen.getByTestId('shell').dataset.inputModality = 'pointer';
    Object.assign(preference, { matches: true });
    fireEvent.click(screen.getByRole('button', { name: 'recent' }));
    expect(screen.getByTestId('view')).toHaveTextContent('recent');
    expect(animations).toHaveLength(0);
  });

  it('finishes a pointer transition immediately when the user switches to keyboard', () => {
    render(<Navigation />);
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByTestId('view')).toHaveTextContent('favorites');
    act(() => vi.runAllTimers());
    expect(committed).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(1);
  });

  it('finishes an active transition when the system requests reduced motion', () => {
    render(<Navigation />);
    fireEvent.click(screen.getByRole('button', { name: 'recent' }));
    act(() => {
      Object.assign(preference, { matches: true });
      preferenceChanged?.();
    });
    expect(screen.getByTestId('view')).toHaveTextContent('recent');
    expect(animations).toHaveLength(1);
  });

  it('clears pending navigation and animations on unmount', () => {
    const { unmount } = render(<Navigation />);
    const oldView = screen.getByTestId('view');
    fireEvent.click(screen.getByRole('button', { name: 'favorites' }));
    unmount();
    act(() => vi.runAllTimers());
    expect(committed).not.toHaveBeenCalled();
    expect(oldView.inert).toBe(false);
    expect(animations[0].revert).toHaveBeenCalled();
    expect(preference.removeEventListener).toHaveBeenCalled();
  });
});
