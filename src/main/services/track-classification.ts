import type { TrackKind } from '../../shared/types';

export const DEFAULT_VOICE_THRESHOLD_SECONDS = 25;
export const MUSIC_DURATION_THRESHOLD_SECONDS = DEFAULT_VOICE_THRESHOLD_SECONDS;
export const MIN_VOICE_THRESHOLD_SECONDS = 1;
export const MAX_VOICE_THRESHOLD_SECONDS = 60;

export function isValidVoiceThreshold(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_VOICE_THRESHOLD_SECONDS
    && value <= MAX_VOICE_THRESHOLD_SECONDS;
}

export function normalizeVoiceThreshold(value: unknown): number {
  return isValidVoiceThreshold(value) ? value : DEFAULT_VOICE_THRESHOLD_SECONDS;
}

export function classifyTrack(
  duration: number | null | undefined,
  voiceThresholdSeconds = DEFAULT_VOICE_THRESHOLD_SECONDS,
): TrackKind {
  const threshold = normalizeVoiceThreshold(voiceThresholdSeconds);
  return typeof duration === 'number'
    && Number.isFinite(duration)
    && duration > threshold
    ? 'music'
    : 'voice';
}

export function trackKindDirectory(kind: TrackKind): '音乐' | '语音' {
  return kind === 'music' ? '音乐' : '语音';
}
