import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeTempDir, extractArchive } from '../../src/main/services/extractor';
import { scanFolder } from '../../src/main/services/scanner';
import { bgiFixture, bwFixture } from '../fixtures/bgi';

describe('BGI/Ethornell audio archives', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await disposeTempDir();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });
  async function fixture(data: Buffer): Promise<{ root: string; archive: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-bgi-test-'));
    roots.push(root);
    const archive = path.join(root, '素晴日.arc');
    await writeFile(archive, data);
    return { root, archive };
  }

  it.each([false, true])('unwraps extensionless BW audio into scannable OGG (legacy=%s)', async (legacy) => {
    const audio = Buffer.from('OggS-unchanged-audio');
    const source = bgiFixture([
      { name: 'bgm001', data: bwFixture(audio) },
      { name: 'image', data: Buffer.from('CompressedBG-image') },
    ], legacy);
    const { archive } = await fixture(source);
    const output = await extractArchive(archive);
    expect(await readdir(output)).toEqual(['bgm001.ogg']);
    expect(await readFile(path.join(output, 'bgm001.ogg'))).toEqual(audio);
    const candidates = await scanFolder({ sourcePath: output, deepScan: false, signal: new AbortController().signal, onProgress: () => undefined });
    expect(candidates.map((candidate) => candidate.fileName)).toEqual(['bgm001.ogg']);
    expect(await readFile(archive)).toEqual(source);
  });

  it('retains the existing GARbro path for other ARC formats', async () => {
    const { archive } = await fixture(Buffer.from('another-arc-format'));
    const runner = vi.fn(async () => undefined);
    await extractArchive(archive, { runner });
    expect(runner).toHaveBeenCalledOnce();
  });

  it('skips short BW dialogue before extraction when a music threshold is provided', async () => {
    const { archive } = await fixture(bgiFixture([
      { name: 'bgm001', data: bwFixture(Buffer.from('OggS-music'), 30) },
      { name: 'yuki_000001', data: bwFixture(Buffer.from('OggS-voice'), 3) },
      { name: 'exact_threshold', data: bwFixture(Buffer.from('OggS-short'), 25) },
    ]));
    const output = await extractArchive(archive, { minimumAudioDurationSeconds: 25 });
    expect(await readdir(output)).toEqual(['bgm001.ogg']);
  });

  it('keeps unknown-duration audio for the normal scanner instead of discarding it', async () => {
    const bw = bwFixture(Buffer.from('OggS-unknown'));
    bw.writeUInt32LE(0, 16);
    const { archive } = await fixture(bgiFixture([{ name: 'unknown', data: bw }]));
    const output = await extractArchive(archive, { minimumAudioDurationSeconds: 25 });
    expect(await readdir(output)).toEqual(['unknown.ogg']);
  });

  it('rejects a truncated BGI index and cleans extraction output', async () => {
    const data = bgiFixture([{ name: 'bgm001', data: bwFixture(Buffer.from('OggS')) }]);
    const { root, archive } = await fixture(data.subarray(0, 40));
    await expect(extractArchive(archive, { tempRoot: root })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('rejects invalid BW payload offsets instead of importing the wrapper', async () => {
    const bw = bwFixture(Buffer.from('OggS'));
    bw.writeUInt32LE(1000, 0);
    const { root, archive } = await fixture(bgiFixture([{ name: 'bgm001', data: bw }]));
    await expect(extractArchive(archive, { tempRoot: root })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('rejects archive paths that escape extraction output', async () => {
    const { root, archive } = await fixture(bgiFixture([{ name: '../escape', data: bwFixture(Buffer.from('OggS')) }]));
    await expect(extractArchive(archive, { tempRoot: root })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('cleans partial output when cancelled between audio entries', async () => {
    const { root, archive } = await fixture(bgiFixture([
      { name: 'bgm001', data: bwFixture(Buffer.from('OggS-first')) },
      { name: 'bgm002', data: bwFixture(Buffer.from('OggS-second')) },
    ]));
    const controller = new AbortController();
    let events = 0;
    await expect(extractArchive(archive, {
      signal: controller.signal, tempRoot: root, onProgress: () => { if (++events === 2) controller.abort(); },
    })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });
});
