import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { inspectSm2MpxArchive, isArchiveFile, isAudioFile } from '../../src/main/services/formats';
import { copyFileStreaming } from '../../src/main/services/file-copy';
import { hashFile, quickFingerprint } from '../../src/main/services/hash';
import { readAudioMetadata } from '../../src/main/services/metadata';

describe('file utilities', () => {
  it('accepts galgame audio formats case-insensitively', () => {
    expect(isAudioFile('BGM.OGG')).toBe(true);
    expect(isAudioFile('cover.png')).toBe(false);
    expect(isArchiveFile('DATA.XP3')).toBe(true);
    expect(isArchiveFile('DATA.zip')).toBe(false);
  });

  it('recognizes extensionless SM2MPX music and voice containers by their header', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-sm2mpx-'));
    const music = path.join(dir, 'WMSC');
    const voice = path.join(dir, 'VOICE1');
    const data = path.join(dir, 'DATA');
    const makeHeader = (name: string): Buffer => {
      const header = Buffer.alloc(32);
      header.write('SM2MPX10', 0, 'ascii');
      header.write(name, 16, 'ascii');
      return header;
    };
    await writeFile(music, makeHeader('WMSC'));
    await writeFile(voice, makeHeader('VOICE1'));
    await writeFile(data, makeHeader('DATA'));

    expect(await inspectSm2MpxArchive(music)).toBe('music');
    expect(await inspectSm2MpxArchive(voice)).toBe('voice');
    expect(await inspectSm2MpxArchive(data)).toBe('other');
    expect(await inspectSm2MpxArchive(path.join(dir, 'missing'))).toBeNull();
  });

  it('copies bytes and returns a stable MD5', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-'));
    const source = path.join(dir, 'source.ogg');
    const target = path.join(dir, 'library', 'source.ogg');
    await writeFile(source, Buffer.from('fixture-audio'));

    await copyFileStreaming(source, target);

    expect(await readFile(target, 'utf8')).toBe('fixture-audio');
    expect(await hashFile(target)).toBe('a4bf5a6a598c0c3a432dd40721ef1fb8');
  });

  it('uses file size and the first bytes for a quick fingerprint', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-'));
    const first = path.join(dir, 'first.ogg');
    const second = path.join(dir, 'second.ogg');
    await writeFile(first, Buffer.from('same-prefix-audio'));
    await writeFile(second, Buffer.from('same-prefix-audio-with-a-different-length'));

    expect(await quickFingerprint(first)).not.toBe(await quickFingerprint(second));
    expect(await quickFingerprint(first)).toBe(await quickFingerprint(first));
  });

  it('keeps metadata parse failures non-fatal', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-'));
    const source = path.join(dir, 'invalid.ogg');
    await writeFile(source, Buffer.from('not-a-real-audio-file'));

    await expect(readAudioMetadata(source)).resolves.toEqual({
      duration: null,
      format: 'ogg',
      fileSize: 21,
    });
  });
});
