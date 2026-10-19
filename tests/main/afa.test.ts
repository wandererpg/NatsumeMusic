import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractArchive, disposeTempDir } from '../../src/main/services/extractor';
import { isArchiveFile } from '../../src/main/services/formats';
import { afaFixture } from '../fixtures/afa';

describe('Alicesoft AFA audio import', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await disposeTempDir();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });
  async function fixture(data: Buffer): Promise<{ root: string; archive: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-afa-test-'));
    roots.push(root);
    const archive = path.join(root, '多娜多娜Sound.AFA');
    await writeFile(archive, data);
    return { root, archive };
  }

  it('recognizes AFA archives in Chinese paths', () => {
    expect(isArchiveFile('D:/游戏/多娜多娜Sound.AFA')).toBe(true);
  });

  it.each([1, 2])('extracts audio only from AFA v%s without changing the source', async (version) => {
    const audio = Buffer.from('OggS-audio');
    const data = afaFixture([
      { name: 'bgm/theme.ogg', data: audio },
      { name: 'image.qnt', data: Buffer.from('not audio') },
    ], version);
    const { archive } = await fixture(data);
    const output = await extractArchive(archive);
    expect(await readFile(path.join(output, 'bgm', 'theme.ogg'))).toEqual(audio);
    await expect(access(path.join(output, 'image.qnt'))).rejects.toBeDefined();
    expect(await readFile(archive)).toEqual(data);
  });

  it('decodes GBK names without losing the OGG extension', async () => {
    // “攻击”：the final GBK byte is a Shift JIS lead byte, which consumes the dot.
    const name = Buffer.concat([Buffer.from('b9a5bbf7', 'hex'), Buffer.from('.ogg')]);
    const { archive } = await fixture(afaFixture([{ name, data: Buffer.from('OggS') }]));
    const output = await extractArchive(archive);
    expect(await readdir(output)).toEqual(['攻击.ogg']);
  });

  it('keeps Shift JIS names in Japanese archives', async () => {
    const name = Buffer.concat([Buffer.from('836583588367', 'hex'), Buffer.from('.ogg')]);
    const { archive } = await fixture(afaFixture([{ name, data: Buffer.from('OggS') }]));
    const output = await extractArchive(archive);
    expect(await readdir(output)).toEqual(['テスト.ogg']);
  });

  it('rejects paths escaping the extraction directory and cleans temporary output', async () => {
    const { root, archive } = await fixture(afaFixture([{ name: '../escape.ogg', data: Buffer.from('OggS') }]));
    await expect(extractArchive(archive, { tempRoot: root })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('rejects out-of-range entries and cleans temporary output', async () => {
    const data = afaFixture([{ name: 'theme.ogg', data: Buffer.from('OggS') }]);
    const { root, archive } = await fixture(data.subarray(0, data.length - 1));
    await expect(extractArchive(archive, { tempRoot: root })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('honors cancellation before extracting', async () => {
    const { root, archive } = await fixture(afaFixture([{ name: 'theme.ogg', data: Buffer.from('OggS') }]));
    const controller = new AbortController();
    controller.abort();
    await expect(extractArchive(archive, { signal: controller.signal, tempRoot: root })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('keeps entries with names that collide after Windows filename normalization', async () => {
    const { archive } = await fixture(afaFixture([
      { name: 'BGM.ogg', data: Buffer.from('first') },
      { name: 'bgm.ogg', data: Buffer.from('second') },
      { name: 'aux.ogg', data: Buffer.from('third') },
    ]));
    const output = await extractArchive(archive);
    expect(await readFile(path.join(output, 'BGM.ogg'), 'utf8')).toBe('first');
    expect(await readFile(path.join(output, 'bgm-2.ogg'), 'utf8')).toBe('second');
    expect(await readFile(path.join(output, '_aux.ogg'), 'utf8')).toBe('third');
  });

  it('cancels between entries and removes partial output', async () => {
    const { root, archive } = await fixture(afaFixture([
      { name: 'first.ogg', data: Buffer.from('first') },
      { name: 'second.ogg', data: Buffer.from('second') },
    ]));
    const controller = new AbortController();
    let progressEvents = 0;
    await expect(extractArchive(archive, {
      tempRoot: root, signal: controller.signal,
      onProgress: () => { if (++progressEvents === 2) controller.abort(); },
    })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(await readdir(root)).toEqual([path.basename(archive)]);
  });

  it('retains the GARbro fallback for AFA v3', async () => {
    const header = Buffer.alloc(16);
    header.write('AFAH');
    header.writeUInt32LE(3, 8);
    const { archive } = await fixture(header);
    const runner = vi.fn(async () => undefined);
    const output = await extractArchive(archive, { runner });
    expect(runner).toHaveBeenCalledOnce();
    await disposeTempDir(output);
  });
});
