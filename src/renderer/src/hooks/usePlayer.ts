import { usePlayerStore } from '../stores/playerStore';

/** React-facing player state and actions. */
export function usePlayer() {
  return usePlayerStore();
}

/** Select only controls for components that do not need playback progress. */
export function usePlayerControls() {
  return usePlayerStore((state) => ({
    play: state.play,
    pause: state.pause,
    toggle: state.toggle,
    next: state.next,
    previous: state.previous,
    seek: state.seek,
    setVolume: state.setVolume,
    setPlayMode: state.setPlayMode,
  }));
}

export { playerEngine, playerStore, usePlayerStore } from '../stores/playerStore';

export default usePlayer;
