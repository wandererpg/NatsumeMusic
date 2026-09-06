import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AppError } from '../../shared/errors';
import type { ScanProgress } from '../../shared/types';
import { inspectSm2MpxArchive, isArchiveFile } from './formats';
import {
  runGarbro,
  type GarbroRunResult,
  type GarbroRunnerOptions,
} from './garbro-runner';

export interface ArchiveRunnerOptions extends GarbroRunnerOptions {
  onOutput?: (output: string) => void;
  rpaScriptPath?: string;
}

/** A process-compatible runner that can be replaced by a deterministic test fixture. */
export type ArchiveRunner =
  | ((options: ArchiveRunnerOptions) => Promise<GarbroRunResult | void>)
  | { run(options: ArchiveRunnerOptions): Promise<GarbroRunResult | void> };

export interface ExtractOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  /** Injected GARbro runner used by tests and embedders. */
  runner?: ArchiveRunner;
  /** Separate runner for the internal RPA script, when needed by tests. */
  rpaRunner?: ArchiveRunner;
  garbroPath?: string;
  rpaScriptPath?: string;
  /** Override the temporary directory parent in tests. */
  tempRoot?: string;
}

const activeTempDirs = new Set<string>();

function normalize(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cancelledError(): AppError {
  return new AppError('CANCELLED', 'Archive extraction cancelled', 'Extraction was cancelled');
}

function extractionError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error.code === 'EXTRACT_FAILED' || error.code === 'CANCELLED'
      ? error
      : new AppError('EXTRACT_FAILED', error.message, 'Unable to extract this archive.', { cause: error });
  }
  return new AppError(
    'EXTRACT_FAILED',
    errorText(error),
    'Unable to extract this archive. The source archive was left unchanged.',
    error instanceof Error ? { cause: error } : undefined,
  );
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw cancelledError();
  }
}

function resourcePath(relativePath: string): string {
  const candidates: string[] = [];
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  // In a packaged Electron app resourcesPath is the stable location for
  // extraResources. During development the source-tree path is preferred.
  if (electronProcess.resourcesPath && !electronProcess.resourcesPath.includes(`${path.sep}node_modules${path.sep}`)) {
    candidates.push(path.join(electronProcess.resourcesPath, 'tools', relativePath));
  }
  candidates.push(path.resolve(__dirname, '../../../resources/tools', relativePath));
  candidates.push(path.resolve(process.cwd(), 'resources/tools', relativePath));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 2];
}

function emitProgress(
  options: ExtractOptions,
  archivePath: string,
  current: number,
  total: number,
  output?: string,
): void {
  options.onProgress?.({
    phase: 'extracting',
    current,
    total,
    currentFile: archivePath,
  });
}

async function invokeRunner(runner: ArchiveRunner, options: ArchiveRunnerOptions): Promise<GarbroRunResult | void> {
  if (typeof runner === 'function') {
    return runner(options);
  }
  return runner.run(options);
}

async function runRpaScript(options: ArchiveRunnerOptions, scriptPath: string): Promise<GarbroRunResult> {
  if (options.signal?.aborted) {
    throw cancelledError();
  }

  return new Promise<GarbroRunResult>((resolve, reject) => {
    let child;
    try {
      child = spawn(process.execPath, [scriptPath, options.archivePath, options.outputDir], { windowsHide: true });
    } catch (error) {
      reject(extractionError(error));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let aborted = false;

    const onOutput = (chunk: Buffer | string, isError = false): void => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (isError) {
        stderr += text;
      } else {
        stdout += text;
      }
      options.onOutput?.(text);
    };
    const onAbort = (): void => {
      aborted = true;
      try {
        child.kill();
      } catch {
        // Close handler settles the operation.
      }
    };
    const cleanup = (): void => options.signal?.removeEventListener('abort', onAbort);
    const fail = (error: AppError): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer | string) => onOutput(chunk));
    child.stderr?.on('data', (chunk: Buffer | string) => onOutput(chunk, true));
    child.once('error', (error: Error) => fail(aborted ? cancelledError() : extractionError(error)));
    child.once('close', (code: number | null) => {
      if (settled) return;
      if (aborted || options.signal?.aborted) {
        fail(cancelledError());
      } else if (code !== 0) {
        fail(extractionError(stderr.trim() || `RPA extractor exited with code ${String(code)}`));
      } else {
        settled = true;
        cleanup();
        resolve({ exitCode: 0, stdout, stderr });
      }
    });
  });
}

/**
 * Extract an archive into a unique temporary directory.
 *
 * The returned directory belongs to the caller and must be released with
 * `disposeTempDir` once candidates have been scanned/copied.
 */
export async function extractArchive(
  archivePathInput: string,
  options: ExtractOptions = {},
): Promise<string> {
  const archivePath = normalize(archivePathInput);
  const extension = path.extname(archivePath).toLowerCase();
  const sm2mpxKind = isArchiveFile(archivePath) ? null : await inspectSm2MpxArchive(archivePath);
  if (!isArchiveFile(archivePath) && sm2mpxKind === null) {
    throw new AppError('UNSUPPORTED_FORMAT', `Unsupported archive extension: ${extension}`, 'This archive format is not supported.');
  }

  checkAborted(options.signal);
  const tempRoot = normalize(options.tempRoot ?? os.tmpdir());
  const outputDir = await mkdtemp(path.join(tempRoot, 'galmusic-extract-'));
  activeTempDirs.add(outputDir);

  const onOutput = (output: string): void => {
    emitProgress(options, archivePath, 1, 1, output);
  };
  const baseRunnerOptions: ArchiveRunnerOptions = {
    garbroPath: normalize(options.garbroPath ?? resourcePath('garbro/GARbro.Console.exe')),
    xp3BridgePath: normalize(resourcePath('garbro/GARbro.Xp3Bridge.exe')),
    probePath: normalize(resourcePath('garbro/GARbro.Probe.exe')),
    useProbe: sm2mpxKind !== null,
    archivePath,
    outputDir,
    signal: options.signal,
    onOutput,
  };

  // Emit an event before starting child work, allowing the renderer to move
  // immediately from the scanning phase to extracting.
  emitProgress(options, archivePath, 1, 1);

  try {
    checkAborted(options.signal);
    if (extension === '.rpa') {
      const rpaOptions = options.rpaRunner ?? options.runner;
      if (rpaOptions) {
        await invokeRunner(rpaOptions, {
          ...baseRunnerOptions,
          rpaScriptPath: normalize(options.rpaScriptPath ?? resourcePath('extract-rpa.mjs')),
        });
      } else {
        try {
          await runRpaScript(
            baseRunnerOptions,
            normalize(options.rpaScriptPath ?? resourcePath('extract-rpa.mjs')),
          );
        } catch (error) {
          // RPA files produced by newer Ren'Py versions can use an encoding
          // the small internal bridge does not understand. GARbro remains a
          // safe fallback for those archives.
          if (options.signal?.aborted || error instanceof AppError && error.code === 'CANCELLED') {
            throw error;
          }
          await runGarbro(baseRunnerOptions);
        }
      }
    } else {
      await invokeRunner(options.runner ?? runGarbro, baseRunnerOptions);
    }

    checkAborted(options.signal);
    return outputDir;
  } catch (error) {
    await disposeTempDir(outputDir);
    throw extractionError(error);
  }
}

/** Remove one extraction directory, or all directories owned by the service. */
export async function disposeTempDir(tempDir?: string): Promise<void> {
  const targets = tempDir ? [normalize(tempDir)] : [...activeTempDirs];
  await Promise.all(targets.map(async (target) => {
    await rm(target, { recursive: true, force: true });
    activeTempDirs.delete(target);
  }));
}

export const extract = extractArchive;
export default extractArchive;
