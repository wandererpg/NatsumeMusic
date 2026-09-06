import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Track } from '../../src/shared/types';
import { PlayerEngine } from '../../src/renderer/src/player/PlayerEngine';
import { playerEngine, usePlayerStore } from '../../src/renderer/src/stores/playerStore';

type HowlCallbacks = {
  onplay?: () => void;
  onpause?: () => void;
  onend?: () => void;
  onloaderror?: (_id: number, error: unknown) => void;
  onplayerror?: (_id: number, error: unknown) => void;
};

const { MockHowl } = vi.hoisted(() => {
  class HoistedMockHowl {
    static instances: HoistedMockHowl[] = [];
    readonly options: HowlCallbacks & Record<string, unknown>;
    readonly play = vi.fn(() => {
      this.options.onplay?.();
      return 1;
    });
    readonly pause = vi.fn(() => {
      this.options.onpause?.();
      return this;
    });
    readonly seek = vi.fn((value?: number) => value ?? 0);
    readonly volume = vi.fn((value?: number) => value ?? 0.8);
    readonly unload = vi.fn();
    readonly duration = vi.fn(() => 120);
    readonly playing = vi.fn(() => false);

    constructor(options: HowlCallbacks & Record<string, unknown>) {
      this.options = options;
      HoistedMockHowl.instances.push(this);
    }

    end() {
      this.options.onend?.();
    }
  }
  return { MockHowl: HoistedMockHowl };
});

vi.mock('howler', () => ({ Howl: MockHowl }));

const track = (id: string, filePath: string, format = 'ogg'): Track => ({
  id,
  gameId: 'game',
  filePath,
  fileName: `${id}.${format}`,
  customName: null,
  displayName: id,
  duration: 120,
  kind: 'music',
  format,
  fileSize: 12,
  fileHash: id,
  trackNumber: 1,
  isFavorite: false,
  createdAt: '',
  updatedAt: '',
});

describe('PlayerEngine', () => {
  beforeEach(() => {
    MockHowl.instances.length = 0;
  });

  it('creates Howl with a file URL, html5 mode, format and volume, and controls playback', () => {
    const engine = new PlayerEngine({ volume: 0.4 });
    const first = track('opening', 'C:\\Music\\opening.ogg');

    engine.setQueue([first]);
    engine.play();
    engine.pause();
    engine.seek(12);
    engine.setVolume(0.7);

    const howl = MockHowl.instances[0];
    expect(howl.options).toMatchObject({
      src: ['galmusic-audio://local?path=C%3A%5CMusic%5Copening.ogg'],
      html5: true,
      format: ['ogg'],
      volume: 0.4,
    });
    expect(howl.play).toHaveBeenCalled();
    expect(howl.pause).toHaveBeenCalled();
    expect(howl.seek).toHaveBeenCalledWith(12);
    expect(howl.volume).toHaveBeenCalledWith(0.7);
  });

  it('unloads the previous Howl when a new track is loaded', () => {
    const engine = new PlayerEngine();
    engine.setQueue([track('one', 'C:\\Music\\one.mp3')]);
    engine.setQueue([track('two', 'C:\\Music\\two.mp3')]);

    expect(MockHowl.instances[0].unload).toHaveBeenCalled();
    expect(MockHowl.instances[1].options.src).toEqual(['galmusic-audio://local?path=C%3A%5CMusic%5Ctwo.mp3']);
  });

  it('advances sequentially and loops a single item in single-loop mode', () => {
    const onTrackChange = vi.fn();
    const engine = new PlayerEngine({ onTrackChange });
    const tracks = [track('one', 'C:\\Music\\one.ogg'), track('two', 'C:\\Music\\two.ogg')];
    engine.setQueue(tracks);
    MockHowl.instances[0].end();
    expect(onTrackChange).toHaveBeenLastCalledWith(tracks[1], 1);

    engine.setPlayMode('single-loop');
    MockHowl.instances[1].end();
    expect(MockHowl.instances[1].play).toHaveBeenCalled();
  });

  it('loops the queue in list-loop mode and never picks current item in random mode', () => {
    const onTrackChange = vi.fn();
    const engine = new PlayerEngine({ onTrackChange, random: () => 0 });
    const tracks = [track('one', 'C:\\Music\\one.ogg'), track('two', 'C:\\Music\\two.ogg')];
    engine.setQueue(tracks);
    engine.setPlayMode('random');
    MockHowl.instances[0].end();
    expect(onTrackChange).toHaveBeenLastCalledWith(tracks[1], 1);

    engine.setPlayMode('list-loop');
    MockHowl.instances[1].end();
    expect(onTrackChange).toHaveBeenLastCalledWith(tracks[0], 0);
  });
});

describe('playerStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
    delete (globalThis as { window?: Window }).window;
  });

  it('keeps restored volume and mode without auto-playing', async () => {
    const setSetting = vi.fn(async () => undefined);
    (globalThis as { window?: Window }).window = {
      galMusic: {
        getSettings: vi.fn(async () => ({
          libraryPath: 'C:/Music',
          volume: 0.25,
          playMode: 'list-loop' as const,
          lastTrackId: 'two',
        })),
        setSetting,
      },
    } as unknown as Window;

    await usePlayerStore.getState().initialize();
    const state = usePlayerStore.getState();
    expect(state.volume).toBe(0.25);
    expect(state.playMode).toBe('list-loop');
    expect(state.lastTrackId).toBe('two');
    expect(state.isPlaying).toBe(false);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('persists volume and the last played track through the preload API', () => {
    const setSetting = vi.fn(async () => undefined);
    (globalThis as { window?: Window }).window = {
      galMusic: { setSetting },
    } as unknown as Window;
    const first = track('one', 'C:\\Music\\one.ogg');

    usePlayerStore.getState().playTrack(first);
    usePlayerStore.getState().setVolume(0.6);

    expect(setSetting).toHaveBeenCalledWith('last_track_id', 'one');
    expect(setSetting).toHaveBeenCalledWith('volume', '0.6');
  });

  it('reloads a moved current track from its refreshed path and leaves playback paused', () => {
    const first = track('one', 'C:\\Music\\Source\\one.ogg');
    const second = track('two', 'C:\\Music\\Source\\two.ogg');
    const movedFirst = { ...first, gameId: 'target', filePath: 'C:\\Music\\Target\\one.ogg' };
    usePlayerStore.getState().playTrack(first, [first, second]);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    usePlayerStore.getState().reconcileLibraryTracks([movedFirst, second], new Set());

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(movedFirst);
    expect(state.playlist).toEqual([movedFirst, second]);
    expect(state.isPlaying).toBe(false);
    expect(playerEngine.currentTrack).toEqual(movedFirst);
    expect(playerEngine.playlist).toEqual([movedFirst, second]);
    expect(MockHowl.instances.at(-1)?.options.src).toEqual([
      'galmusic-audio://local?path=C%3A%5CMusic%5CTarget%5Cone.ogg',
    ]);
  });

  it('stops and clears the queue when the current track is deleted', () => {
    const first = track('one', 'C:\\Music\\one.ogg');
    const second = track('two', 'C:\\Music\\two.ogg');
    usePlayerStore.getState().playTrack(first, [first, second]);

    usePlayerStore.getState().reconcileLibraryTracks([second], new Set(['one']));

    const state = usePlayerStore.getState();
    expect(state.currentTrack).toBeNull();
    expect(state.playlist).toEqual([]);
    expect(state.isPlaying).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.progress).toBe(0);
    expect(state.duration).toBeNull();
    expect(playerEngine.currentTrack).toBeNull();
    expect(playerEngine.playlist).toEqual([]);
  });
});
