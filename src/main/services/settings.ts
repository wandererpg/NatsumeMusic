import type Database from 'better-sqlite3';
import path from 'node:path';

import { THEME_IDS, type AppSettings, type AppSettingsUpdate, type PlayMode, type ThemeId } from '../../shared/types';
import { getSetting, setSetting } from '../database/queries/settings';
import { normalizeVoiceThreshold } from './track-classification';

type SQLiteDatabase = Database.Database;

export interface NormalizeLibraryPathOptions {
  cwd: string;
  environment: Record<string, string | undefined>;
  pathExists(path: string): boolean;
}

export function normalizeLibraryPath(value: string, _options: NormalizeLibraryPathOptions): string {
  const options = _options;
  const trimmed = value.trim();
  if (!trimmed) return '';
  const containsEnvironmentToken = /%[^%]+%/.test(trimmed);
  const legacyAbsolute = path.resolve(options.cwd, trimmed);
  // Preserve an already-populated legacy directory created when a literal
  // %USERPROFILE% value was accidentally treated as cwd-relative.
  if (containsEnvironmentToken && options.pathExists(legacyAbsolute)) {
    return legacyAbsolute;
  }
  const expanded = trimmed.replace(/%([^%]+)%/g, (token, name: string) => {
    const replacement = options.environment[name] ?? options.environment[name.toUpperCase()];
    return replacement?.trim() ? replacement : token;
  });
  return path.resolve(options.cwd, expanded);
}

function parsePlayMode(value: string | undefined): PlayMode {
  return value === 'sequential' || value === 'random' || value === 'single-loop' || value === 'list-loop'
    ? value
    : 'list-loop';
}

function parseThemeId(value: string | undefined): ThemeId {
  return THEME_IDS.includes(value as ThemeId) ? value as ThemeId : 'rain-afterglow';
}

function parseFontColor(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function readNumber(db: SQLiteDatabase, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = getSetting(db, key);
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export function saveAppSettings(db: SQLiteDatabase, changes: AppSettingsUpdate): void {
  db.transaction(() => {
    setSetting(db, 'library_path', changes.libraryPath);
    setSetting(db, 'volume', String(changes.volume));
    setSetting(db, 'play_mode', changes.playMode);
    setSetting(db, 'theme_id', changes.themeId);
    setSetting(db, 'font_color', parseFontColor(changes.fontColor ?? undefined) ?? '');
    setSetting(db, 'background_image_path', changes.background.imagePath ?? '');
    setSetting(db, 'background_blur', String(changes.background.blur));
    setSetting(db, 'background_dim', String(changes.background.dim));
    setSetting(db, 'background_scale', String(changes.background.scale));
    setSetting(db, 'background_position_x', String(changes.background.positionX));
    setSetting(db, 'background_position_y', String(changes.background.positionY));
  })();
}

/** Read user preferences from the string-valued settings table. */
export function readAppSettings(db: SQLiteDatabase): AppSettings {
  const volumeRaw = Number(getSetting(db, 'volume') ?? '0.8');
  const voiceThresholdRaw = Number(getSetting(db, 'voice_threshold_seconds') ?? '25');
  return {
    libraryPath: getSetting(db, 'library_path') ?? '',
    volume: Number.isFinite(volumeRaw) ? Math.min(1, Math.max(0, volumeRaw)) : 0.8,
    playMode: parsePlayMode(getSetting(db, 'play_mode')),
    lastTrackId: getSetting(db, 'last_track_id') ?? null,
    voiceThresholdSeconds: normalizeVoiceThreshold(voiceThresholdRaw),
    themeId: parseThemeId(getSetting(db, 'theme_id')),
    fontColor: parseFontColor(getSetting(db, 'font_color')),
    background: {
      imagePath: getSetting(db, 'background_image_path')?.trim() || null,
      blur: readNumber(db, 'background_blur', 12, 0, 40),
      dim: readNumber(db, 'background_dim', 0.42, 0, 0.85),
      scale: readNumber(db, 'background_scale', 100, 100, 180),
      positionX: readNumber(db, 'background_position_x', 50, 0, 100),
      positionY: readNumber(db, 'background_position_y', 50, 0, 100),
    },
    windowWidth: Number(getSetting(db, 'window_width') ?? '') || undefined,
    windowHeight: Number(getSetting(db, 'window_height') ?? '') || undefined,
  };
}

/** Persist one validated IPC setting value. */
export function writeAppSetting(db: SQLiteDatabase, key: string, value: string): void {
  const allowed = new Set(['library_path', 'volume', 'play_mode', 'last_track_id', 'voice_threshold_seconds', 'window_width', 'window_height']);
  if (!allowed.has(key)) throw new Error(`Setting key is not writable through the generic API: ${key}`);
  setSetting(db, key, value);
}
