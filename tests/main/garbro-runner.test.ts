import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => childProcessMock);

import { runGarbro } from '../../src/main/services/garbro-runner';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('GARbro console runner', () => {
  it('uses GARbro.Probe for an SM2MPX container without adding the console extract flag', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-probe-'));
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(async () => {
        await writeFile(path.join(outputDir, '02.ogg'), Buffer.from('audio'));
        child.emit('close', 0);
      });
      return child;
    });

    try {
      await runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        probePath: 'C:/tools/GARbro.Probe.exe',
        useProbe: true,
        archivePath: 'C:/games/WMSC',
        outputDir,
      });

      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        'C:/tools/GARbro.Probe.exe',
        ['C:/games/WMSC'],
        { windowsHide: true, cwd: outputDir },
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('uses the non-interactive XP3 bridge so GARbro can select the no-encryption scheme', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-xp3-'));
    const logPath = path.join(outputDir, 'garbro-xp3.log');
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(async () => {
        await writeFile(path.join(outputDir, 'bgm.ogg'), Buffer.from('audio'));
        child.emit('close', 0);
      });
      return child;
    });

    try {
      await runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        xp3BridgePath: 'C:/tools/GARbro.Xp3Bridge.exe',
        archivePath: 'C:/games/data.xp3',
        outputDir,
        logPath,
      });

      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        'C:/tools/GARbro.Xp3Bridge.exe',
        ['C:/games/data.xp3'],
        { windowsHide: true, cwd: outputDir },
      );
      await expect(readFile(logPath, 'utf8')).resolves.toContain('executable=C:/tools/GARbro.Xp3Bridge.exe');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('accepts an XP3 archive that the bridge reports contains no audio', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-xp3-empty-'));
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'Extracted 0 audio files');
        child.emit('close', 0);
      });
      return child;
    });

    try {
      await expect(runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        xp3BridgePath: 'C:/tools/GARbro.Xp3Bridge.exe',
        archivePath: 'C:/games/bgimage.xp3',
        outputDir,
      })).resolves.toMatchObject({ extractedFiles: 0 });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('uses the console extract flag, writes into the requested output directory, and logs the result', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-runner-'));
    const logPath = path.join(outputDir, 'garbro-test.log');
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(async () => {
        await writeFile(path.join(outputDir, 'bgm.ogg'), Buffer.from('audio'));
        child.stdout.emit('data', 'Extracting bgm.ogg ...');
        child.emit('close', 0);
      });
      return child;
    });

    try {
      const result = await runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        archivePath: 'C:/games/data.xp3',
        outputDir,
        logPath,
      });

      expect(childProcessMock.spawn).toHaveBeenCalledWith(
        'C:/tools/GARbro.Console.exe',
        ['-x', 'C:/games/data.xp3'],
        { windowsHide: true, cwd: outputDir },
      );
      expect(result.extractedFiles).toBe(1);
      await expect(readFile(logPath, 'utf8')).resolves.toContain('Extracting bgm.ogg');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('treats GARbro stderr as an extraction failure even when it exits zero', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-empty-'));
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => {
        child.stderr.emit('data', 'unknown format');
        child.emit('close', 0);
      });
      return child;
    });

    try {
      await expect(runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        archivePath: 'C:/games/data.xp3',
        outputDir,
      })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it('rejects an exit-code-zero run that produced no files', async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-garbro-empty-'));
    const child = makeChild();
    childProcessMock.spawn.mockImplementationOnce(() => {
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });

    try {
      await expect(runGarbro({
        garbroPath: 'C:/tools/GARbro.Console.exe',
        archivePath: 'C:/games/data.xp3',
        outputDir,
      })).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
