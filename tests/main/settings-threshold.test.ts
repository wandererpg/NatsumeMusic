import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { setSetting } from '../../src/main/database/queries/settings';
import { readAppSettings } from '../../src/main/services/settings';

describe('voice threshold settings', () => {
  it('defaults to 25 seconds', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(readAppSettings(db).voiceThresholdSeconds).toBe(25);
    db.close();
  });

  it.each(['', 'NaN', '0', '61'])('falls back for invalid stored value %s', (value) => {
    const db = new Database(':memory:');
    migrate(db);
    setSetting(db, 'voice_threshold_seconds', value);
    expect(readAppSettings(db).voiceThresholdSeconds).toBe(25);
    db.close();
  });

  it('reads a valid decimal threshold', () => {
    const db = new Database(':memory:');
    migrate(db);
    setSetting(db, 'voice_threshold_seconds', '18.5');
    expect(readAppSettings(db).voiceThresholdSeconds).toBe(18.5);
    db.close();
  });
});
