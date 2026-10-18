import { animate, type JSAnimation } from 'animejs';
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const EXIT_MS = 70;
const ENTER_MS = 190;

/** One live view: cancel obsolete destinations instead of queueing transitions. */
export function useNavigationMotion(container: RefObject<HTMLElement>, viewKey: string) {
  const key = useRef(viewKey);
  const pending = useRef<{ destination: string; commit: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animation = useRef<JSAnimation | null>(null);
  const exitingView = useRef<HTMLElement | null>(null);
  const enterNext = useRef(false);

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    animation.current?.revert();
    animation.current = null;
    if (exitingView.current) exitingView.current.inert = false;
    exitingView.current = null;
  }, []);

  const motionAllowed = useCallback(() => {
    const shell = container.current?.closest<HTMLElement>('.app-shell');
    return shell?.dataset.inputModality !== 'keyboard'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, [container]);

  const finishImmediately = useCallback(() => {
    const request = pending.current;
    pending.current = null;
    enterNext.current = false;
    stop();
    request?.commit();
  }, [stop]);

  const navigate = useCallback((destination: string, commit: () => void) => {
    // Restore the previous view before starting the latest request. No stale
    // completion callback can replace the user's last destination.
    stop();
    pending.current = null;
    enterNext.current = false;
    const view = container.current?.querySelector<HTMLElement>('.library-view');
    if (destination === key.current || !view || !motionAllowed()) {
      commit();
      return;
    }
    pending.current = { destination, commit };
    exitingView.current = view;
    view.inert = true;
    animation.current = animate(view, {
      opacity: [1, 0.55], y: [0, -4], duration: EXIT_MS, ease: 'outQuad',
    });
    // Navigation is bounded by a timer, independent of animation frames. A
    // background window or a slow frame must never hold navigation open.
    timer.current = setTimeout(() => {
      const request = pending.current;
      pending.current = null;
      stop();
      enterNext.current = motionAllowed();
      request?.commit();
    }, EXIT_MS);
  }, [container, motionAllowed, stop]);

  useLayoutEffect(() => {
    if (viewKey === key.current) return;
    key.current = viewKey;
    pending.current = null;
    stop();
    const view = container.current?.querySelector<HTMLElement>('.library-view');
    if (view && enterNext.current && motionAllowed()) {
      animation.current = animate(view, {
        opacity: [0.55, 1], y: [6, 0], duration: ENTER_MS, ease: 'outCubic',
        onComplete: () => {
          animation.current?.revert();
          animation.current = null;
        },
      });
    }
    enterNext.current = false;
  }, [container, motionAllowed, stop, viewKey]);

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => { if (preference?.matches) finishImmediately(); };
    // Keyboard input also interrupts a transition already started by a pointer.
    document.addEventListener('keydown', finishImmediately, true);
    preference?.addEventListener('change', onPreferenceChange);
    return () => {
      document.removeEventListener('keydown', finishImmediately, true);
      preference?.removeEventListener('change', onPreferenceChange);
      pending.current = null;
      stop();
    };
  }, [finishImmediately, stop]);

  return navigate;
}
