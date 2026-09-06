import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { insertTrack, listTracks } from '../../src/main/database/queries/tracks';
import { backfillMissingGameMetadata, backfillMissingTrackMetadata } from '../../src/main/services/metadata-backfill';

describe('metadata backfill', () => {
  it('queries existing games once so older imports receive metadata and covers too', async () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: '家族計画 ～追憶～' });
    createGame(db, { id: 'g2', name: 'ATRI' });
    const ensure = vi.fn().mockResolvedValue(undefined);

    await backfillMissingGameMetadata(db, { ensure });

    expect(ensure).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenNthCalledWith(1, 'g1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(ensure).toHaveBeenNthCalledWith(2, 'g2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    db.close();
  });

  it('persists duration and detected title for tracks imported before metadata indexing', async () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'Old Import' });
    insertTrack(db, {
      id: 't1', gameId: 'g1', filePath: 'C:/library/bgm01.ogg', fileName: 'bgm01.ogg',
      format: 'ogg', fileSize: 100, fileHash: 'old-import', duration: null,
    });
    const reader = vi.fn().mockResolvedValue({
      duration: 159.9986, title: 'Blue Memory', format: 'ogg', fileSize: 100,
    });

    await backfillMissingTrackMetadata(db, reader);

    expect(listTracks(db, 'g1')[0]).toMatchObject({ duration: 159.9986, displayName: 'Blue Memory' });
    db.close();
  });
});
