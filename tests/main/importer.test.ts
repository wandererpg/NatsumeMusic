import Database from 'better-sqlite3';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame, listGames } from '../../src/main/database/queries/games';
import { insertTrack, listTracks } from '../../src/main/database/queries/tracks';
import { hashFile } from '../../src/main/services/hash';
import {
  importGameFolder,
  type ExtractorService,
} from '../../src/main/services/importer';
import type { GameMetadataService } from '../../src/main/services/game-metadata';
import type { ScanProgress } from '../../src/shared/types';
import { afaFixture } from '../fixtures/afa';
import { bgiFixture, bwFixture } from '../fixtures/bgi';

describe('game-folder importer', () => {
  it.each([false, true])('imports BGI audio and respects includeVoice=%s without extracting images', async (includeVoice) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-bgi-'));
    const source = path.join(root, '素晴日');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source);
      await writeFile(path.join(source, 'data05000.arc'), bgiFixture([
        { name: 'bgm001', data: wavWithDuration(30) },
        { name: 'short', data: wavWithDuration(2) },
      ]));
      await writeFile(path.join(source, 'data04010.arc'), bgiFixture([
        { name: 'yuki_000001', data: bwFixture(Buffer.from('OggS-voice'), 3) },
      ]));
      await writeFile(path.join(source, 'data02910.arc'), bgiFixture([
        { name: 'image', data: Buffer.from('CompressedBG-image') },
      ]));
      const archives = new Set<string>();
      const result = await importGameFolder({
        sourcePath: source, libraryPath: path.join(root, 'library'), gameName: '素晴日',
        deepScan: true, includeVoice, voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: (event) => { if (event.phase === 'extracting') archives.add(path.basename(event.currentFile)); }, db,
      });
      expect(result).toMatchObject({ extracted: includeVoice ? 2 : 1, copied: includeVoice ? 3 : 1, errors: [] });
      expect(archives.has('data02910.arc')).toBe(false);
      expect(archives.has('data04010.arc')).toBe(includeVoice);
      const tracks = listTracks(db, listGames(db)[0].id);
      expect(tracks.filter((track) => track.kind === 'music')).toHaveLength(1);
      expect(tracks.filter((track) => track.kind === 'voice')).toHaveLength(includeVoice ? 2 : 0);
      expect(await readFile(tracks.find((track) => track.kind === 'music')!.filePath)).toEqual(wavWithDuration(30));
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([false, true])('imports AFA music and respects includeVoice=%s without extracting images', async (includeVoice) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-afa-'));
    const source = path.join(root, '多娜多娜');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source);
      await writeFile(path.join(source, 'dohnadohnaSound.afa'), afaFixture([
        { name: '配乐.ogg.wav', data: wavWithDuration(30) },
        { name: '音效.wav', data: wavWithDuration(2) },
      ]));
      await writeFile(path.join(source, 'dohnadohnaVoice.afa'), afaFixture([
        { name: 'voice.wav', data: wavWithDuration(3) },
      ]));
      await writeFile(path.join(source, 'dohnadohnaCG.afa'), afaFixture([
        { name: 'image.qnt', data: Buffer.from('not audio') },
      ]));
      const archives: string[] = [];
      const result = await importGameFolder({
        sourcePath: source, libraryPath: path.join(root, 'library'), gameName: '多娜多娜',
        deepScan: true, includeVoice, voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: (event) => { if (event.phase === 'extracting') archives.push(path.basename(event.currentFile)); },
        db,
      });
      expect(result).toMatchObject({ extracted: includeVoice ? 2 : 1, copied: includeVoice ? 3 : 1, errors: [] });
      expect(archives).toContain('dohnadohnaSound.afa');
      expect(archives).not.toContain('dohnadohnaCG.afa');
      expect(archives.includes('dohnadohnaVoice.afa')).toBe(includeVoice);
      const tracks = listTracks(db, listGames(db)[0].id);
      expect(tracks.filter((track) => track.kind === 'music')).toHaveLength(1);
      expect(tracks.filter((track) => track.kind === 'voice')).toHaveLength(includeVoice ? 2 : 0);
      expect(await readFile(tracks.find((track) => track.kind === 'music')!.filePath)).toEqual(wavWithDuration(30));
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  function sm2MpxHeader(name: string): Buffer {
    const header = Buffer.alloc(32);
    header.write('SM2MPX10', 0, 'ascii');
    header.write(name, 16, 'ascii');
    return header;
  }

  function wavWithDuration(durationSeconds: number): Buffer {
    const sampleRate = 8000;
    const dataSize = Math.round(sampleRate * durationSeconds);
    const buffer = Buffer.alloc(44 + dataSize, 128);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate, 28);
    buffer.writeUInt16LE(1, 32); buffer.writeUInt16LE(8, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
    return buffer;
  }

  it('decodes anemoi OWP audio to a playable OGG file during import', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-owp-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(source, { recursive: true });
      const decoded = Buffer.from('OggS\0fixture-vorbis-bytes');
      const encoded = Buffer.from(decoded.map((value) => value ^ 0x39));
      await writeFile(path.join(source, 'M01A.owp'), encoded);

      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'anemoi',
        deepScan: false,
        includeVoice: true,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        db,
      });

      expect(result).toEqual({ found: 1, extracted: 0, copied: 1, skipped: 0, errors: [] });
      const tracks = listTracks(db, listGames(db)[0].id);
      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({ fileName: 'M01A.ogg', format: 'ogg', fileSize: decoded.length });
      await expect(readFile(tracks[0].filePath)).resolves.toEqual(decoded);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('extracts, copies, deduplicates, and persists an imported game', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const extractedDirs: string[] = [];
    const progress: ScanProgress[] = [];
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'bgm.ogg'), Buffer.from('same-audio'));
      await writeFile(path.join(source, 'duplicate.mp3'), Buffer.from('same-audio'));
      await writeFile(path.join(source, 'voice.xp3'), Buffer.from('archive-placeholder'));

      const extractor: ExtractorService = {
        async extractArchive(_archivePath, options) {
          const outputDir = await mkdtemp(path.join(root, 'extract-'));
          extractedDirs.push(outputDir);
          await writeFile(path.join(outputDir, 'voice.wav'), Buffer.from('archive-audio'));
          options?.onProgress?.({
            phase: 'extracting',
            current: 1,
            total: 1,
            currentFile: path.join(source, 'voice.xp3'),
          });
          return outputDir;
        },
        async disposeTempDir(tempDir) {
          if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
          }
        },
      };

      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'ATRI',
        deepScan: true,
        includeVoice: true,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: (event) => progress.push(event),
        db,
        extractor,
      });

      expect(result).toEqual({
        found: 3,
        extracted: 1,
        copied: 2,
        skipped: 1,
        errors: [],
      });
      expect(listGames(db)).toHaveLength(1);
      expect(listGames(db)[0].name).toBe('ATRI');
      expect(listTracks(db, listGames(db)[0].id)).toHaveLength(2);
      expect(await readdir(path.join(library, 'ATRI'))).toEqual(['语音']);
      expect(await readdir(path.join(library, 'ATRI', '语音'))).toHaveLength(2);
      expect(listTracks(db, listGames(db)[0].id).every((track) => track.kind === 'voice')).toBe(true);
      expect(progress.some((event) => event.phase === 'scanning')).toBe(true);
      expect(progress.some((event) => event.phase === 'extracting')).toBe(true);
      expect(progress.some((event) => event.phase === 'copying')).toBe(true);
      for (const outputDir of extractedDirs) {
        await expect(readdir(outputDir)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('extracts WMSC but skips SM2MPX voice and non-audio containers when voice import is disabled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-sm2mpx-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const extractedArchives: string[] = [];
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'WMSC'), sm2MpxHeader('WMSC'));
      await writeFile(path.join(source, 'VOICE1'), sm2MpxHeader('VOICE1'));
      await writeFile(path.join(source, 'SE'), sm2MpxHeader('SE'));
      const extractor: ExtractorService = {
        async extractArchive(archivePath) {
          extractedArchives.push(path.basename(archivePath));
          const outputDir = await mkdtemp(path.join(root, 'extract-'));
          await writeFile(path.join(outputDir, '02.wav'), wavWithDuration(30));
          return outputDir;
        },
        async disposeTempDir(tempDir) {
          if (tempDir) await rm(tempDir, { recursive: true, force: true });
        },
      };

      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: '家族計画 ～追憶～',
        deepScan: true,
        includeVoice: false,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        db,
        extractor,
      });

      expect(extractedArchives).toEqual(['WMSC']);
      expect(result).toMatchObject({ extracted: 1, copied: 1, errors: [] });
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('imports a game whose display name contains Windows-invalid path characters', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-invalid-name-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'bgm.ogg'), Buffer.from('audio'));

      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'as:9-nine-ARTEISIA',
        deepScan: false,
        includeVoice: true,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        db,
      });

      expect(result).toEqual({ found: 1, extracted: 0, copied: 1, skipped: 0, errors: [] });
      expect(listGames(db)[0].name).toBe('as:9-nine-ARTEISIA');
      await expect(readdir(path.join(library, 'as_9-nine-ARTEISIA'))).resolves.toEqual(['语音']);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enriches an existing code-named track when a later scan finds a sidecar title', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-enrich-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'bgm_001.ogg'), Buffer.from('audio'));
      const request = {
        sourcePath: source, libraryPath: library, gameName: 'Named Later', deepScan: false, includeVoice: true, voiceThresholdSeconds: 25,
        signal: new AbortController().signal, onProgress: () => undefined, db,
      };
      await importGameFolder(request);
      await writeFile(path.join(source, 'album.cue'), 'FILE "bgm_001.ogg" OGG\n  TRACK 01 AUDIO\n    TITLE "True Song Name"');

      const result = await importGameFolder(request);
      const importedGame = listGames(db)[0];
      expect(result.skipped).toBe(1);
      expect(listTracks(db, importedGame.id)[0].displayName).toBe('True Song Name');
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('skips unknown-duration audio when voice import is disabled', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-no-voice-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'voice.ogg'), Buffer.from('not-real-audio'));
      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'Voice Off',
        deepScan: false,
        includeVoice: false,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        db,
      });

      expect(result).toMatchObject({ found: 1, copied: 0, skipped: 1 });
      expect(listTracks(db, listGames(db)[0].id)).toHaveLength(0);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reclassifies and moves a duplicate when its missing duration becomes known', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-reclassify-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const oldDirectory = path.join(library, 'Known Later', '音乐');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source, { recursive: true });
      await mkdir(oldDirectory, { recursive: true });
      const bytes = wavWithDuration(1);
      const sourcePath = path.join(source, 'line.wav');
      const oldPath = path.join(oldDirectory, 'line.wav');
      await writeFile(sourcePath, bytes);
      await writeFile(oldPath, bytes);
      createGame(db, { id: 'g-known', name: 'Known Later' });
      insertTrack(db, { id: 't-known', gameId: 'g-known', filePath: oldPath, fileName: 'line.wav', duration: null, kind: 'music', format: 'wav', fileSize: bytes.length, fileHash: await hashFile(sourcePath) });

      await importGameFolder({ sourcePath: source, libraryPath: library, gameName: 'Known Later', deepScan: false, includeVoice: false, voiceThresholdSeconds: 10, signal: new AbortController().signal, onProgress: () => undefined, db });

      expect(listTracks(db, 'g-known')[0]).toMatchObject({ kind: 'voice', filePath: path.join(library, 'Known Later', '语音', 'line.wav') });
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses a custom voice threshold for imported audio', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-threshold-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'equal.wav'), wavWithDuration(10));
      await writeFile(path.join(source, 'above.wav'), wavWithDuration(10.1));
      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'Custom Threshold',
        deepScan: false,
        includeVoice: true,
        voiceThresholdSeconds: 10,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        db,
      });
      const imported = listTracks(db, listGames(db)[0].id);
      expect(imported.find((track) => track.fileName === 'equal.wav')?.kind).toBe('voice');
      expect(imported.find((track) => track.fileName === 'above.wav')?.kind).toBe('music');
      expect(result.copied).toBe(2);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('enriches a successful import without making metadata failure fatal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-import-metadata-'));
    const source = path.join(root, 'source');
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);
    const progress: ScanProgress[] = [];
    const metadata = {
      ensure: vi.fn().mockRejectedValue(new Error('offline')),
      getSummary: vi.fn(),
      search: vi.fn(),
      lookup: vi.fn(),
      prepareUpdate: vi.fn(),
      withGameLock: (_id, action) => action(),
      refresh: vi.fn(),
    } satisfies GameMetadataService;
    try {
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, 'bgm.ogg'), Buffer.from('audio'));
      const result = await importGameFolder({
        sourcePath: source,
        libraryPath: library,
        gameName: 'Offline Metadata',
        deepScan: false,
        includeVoice: true,
        voiceThresholdSeconds: 25,
        signal: new AbortController().signal,
        onProgress: (event) => progress.push(event),
        db,
        metadata,
      });

      expect(result.copied).toBe(1);
      expect(metadata.ensure).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
      expect(progress.some((event) => event.phase === 'copying')).toBe(true);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
