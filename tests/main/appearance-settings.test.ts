import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { setSetting } from '../../src/main/database/queries/settings';
import { readAppSettings, saveAppSettings } from '../../src/main/services/settings';

describe('appearance settings', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('uses the existing rain theme and safe global background defaults', () => {
    db = new Database(':memory:');
    migrate(db);

    expect(readAppSettings(db)).toMatchObject({
      fontColor: null,
      themeId: 'rain-afterglow',
      background: {
        imagePath: null,
        blur: 12,
        dim: 0.42,
        scale: 100,
        positionX: 50,
        positionY: 50,
      },
    });
  });

  it('reads a supported theme and persisted global background', () => {
    db = new Database(':memory:');
    migrate(db);
    setSetting(db, 'theme_id', 'neon-terminal');
    setSetting(db, 'font_color', '#FF77AA');
    setSetting(db, 'background_image_path', 'D:\\Pictures\\scene.png');
    setSetting(db, 'background_blur', '18');
    setSetting(db, 'background_dim', '0.6');
    setSetting(db, 'background_scale', '135');
    setSetting(db, 'background_position_x', '35');
    setSetting(db, 'background_position_y', '70');

    expect(readAppSettings(db)).toMatchObject({
      fontColor: '#ff77aa',
      themeId: 'neon-terminal',
      background: {
        imagePath: 'D:\\Pictures\\scene.png',
        blur: 18,
        dim: 0.6,
        scale: 135,
        positionX: 35,
        positionY: 70,
      },
    });
  });

  it('falls back from unsupported themes and clamps numeric values', () => {
    db = new Database(':memory:');
    migrate(db);
    setSetting(db, 'theme_id', 'washi-sakura');
    setSetting(db, 'font_color', 'hotpink');
    setSetting(db, 'background_blur', '999');
    setSetting(db, 'background_dim', '-2');
    setSetting(db, 'background_scale', '20');
    setSetting(db, 'background_position_x', 'NaN');
    setSetting(db, 'background_position_y', '125');

    const settings = readAppSettings(db);
    expect(settings.themeId).toBe('rain-afterglow');
    expect(settings.fontColor).toBeNull();
    expect(settings.background).toEqual({
      imagePath: null,
      blur: 40,
      dim: 0,
      scale: 100,
      positionX: 50,
      positionY: 100,
    });
  });

  it.each(['', '   '])('uses numeric defaults for blank stored values %j', (value) => {
    db = new Database(':memory:');
    migrate(db);
    for (const key of ['background_blur', 'background_dim', 'background_scale', 'background_position_x', 'background_position_y']) {
      setSetting(db, key, value);
    }
    expect(readAppSettings(db).background).toEqual({ imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 });
  });

  it('saves all user-facing settings in one transaction', () => {
    db = new Database(':memory:');
    migrate(db);
    saveAppSettings(db, {
      libraryPath: 'C:/Music/GalMusic', volume: 0.45, playMode: 'random', themeId: 'neon-terminal', fontColor: '#ff77aa',
      background: { imagePath: 'D:/Pictures/scene.png', blur: 18, dim: 0.6, scale: 130, positionX: 35, positionY: 70 },
    });
    expect(readAppSettings(db)).toMatchObject({
      libraryPath: 'C:/Music/GalMusic', volume: 0.45, playMode: 'random', themeId: 'neon-terminal', fontColor: '#ff77aa',
      background: { imagePath: 'D:/Pictures/scene.png', blur: 18, dim: 0.6, scale: 130, positionX: 35, positionY: 70 },
    });
  });
});
