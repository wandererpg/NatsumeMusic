import { describe, expect, it } from 'vitest';

import {
  classifyTrack,
  DEFAULT_VOICE_THRESHOLD_SECONDS,
  normalizeVoiceThreshold,
  trackKindDirectory,
} from '../../src/main/services/track-classification';

describe('track classification', () => {
  it.each([
    [25.001, 'music'],
    [25, 'voice'],
    [0, 'voice'],
    [null, 'voice'],
    [undefined, 'voice'],
    [Number.NaN, 'voice'],
  ])('classifies duration %s as %s', (duration, expected) => {
    expect(classifyTrack(duration)).toBe(expected);
  });

  it('maps kinds to the confirmed category directories', () => {
    expect(trackKindDirectory('music')).toBe('音乐');
    expect(trackKindDirectory('voice')).toBe('语音');
  });

  it('uses a caller-supplied threshold', () => {
    expect(classifyTrack(10.1, 10)).toBe('music');
    expect(classifyTrack(10, 10)).toBe('voice');
    expect(classifyTrack(null, 10)).toBe('voice');
  });

  it.each([
    [undefined, 25],
    [Number.NaN, 25],
    [0, 25],
    [61, 25],
    [1, 1],
    [25.5, 25.5],
    [60, 60],
  ])('normalizes threshold %s to %s', (input, expected) => {
    expect(normalizeVoiceThreshold(input)).toBe(expected);
  });

  it('keeps 25 seconds as the default', () => {
    expect(DEFAULT_VOICE_THRESHOLD_SECONDS).toBe(25);
  });
});
