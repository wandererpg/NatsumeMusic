import { spawn } from 'node:child_process';
import { appendFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../../shared/errors';

/** Options passed to the bundled GARbro command line process. */
export interface GarbroRunnerOptions {
  garbroPath: string;
  /** Non-interactive bridge used for XP3 archives that require a scheme choice. */
  xp3BridgePath?: string;
  /** Probe bridge used for extensionless SM2MPX containers. */
  probePath?: string;
  /** Explicitly selects Probe after the caller has validated the file header. */
  useProbe?: boolean;
  archivePath: string;
  outputDir: string;
  signal?: AbortSignal;
  /** Receives output lines/chunks for progress logging. */
  onOutput?: (output: string) => void;
  /** Alias kept for callers that call process output progress. */
  onProgress?: (output: string) => void;
  /** Persistent diagnostic log. Production configures this in userData/logs. */
  logPath?: string;
}

export interface GarbroRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  extractedFiles?: number;
}

export type GarbroRunner = (options: GarbroRunnerOptions) => Promise<GarbroRunResult | void>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cancelledError(cause?: unknown): AppError {
  return new AppError(
    'CANCELLED',
    cause instanceof Error ? cause.message : 'GARbro extraction cancelled',
    'Extraction was cancelled',
    cause instanceof Error ? { cause } : undefined,
  );
}

function extractionError(message: string, cause?: unknown): AppError {
  return new AppError(
    'EXTRACT_FAILED',
    message,
    'Unable to extract this archive. The source archive was left unchanged.',
    cause instanceof Error ? { cause } : undefined,
  );
}

let configuredLogPath: string | undefined;

export function configureGarbroLogPath(logPath: string | undefined): void {
  configuredLogPath = logPath;
}

async function countFiles(directory: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countFiles(path.join(directory, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function writeDiagnostic(
  options: GarbroRunnerOptions,
  status: string,
  stdout: string,
  stderr: string,
): Promise<void> {
  const logPath = options.logPath ?? configuredLogPath;
  if (!logPath) return;
  const block = [
    `[${new Date().toISOString()}] ${status}`,
    `executable=${options.garbroPath}`,
    `archive=${options.archivePath}`,
    `output=${options.outputDir}`,
    stdout.trim() ? `stdout:\n${stdout.trim()}` : 'stdout=(empty)',
    stderr.trim() ? `stderr:\n${stderr.trim()}` : 'stderr=(empty)',
    '',
  ].join('\n');
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(logPath, block, 'utf8');
  } catch {
    // Logging must not mask the extraction result.
  }
}

function fatalDiagnostic(stderr: string): string | null {
  const diagnostic = stderr.trim();
  if (!diagnostic) return null;
  return /unknown format|not found|access.+denied|exception|failed|error/i.test(diagnostic)
    ? diagnostic
    : null;
}

/**
 * Run GARbro with an argument array (never a shell command string).
 *
 * The child process owns archive extraction; this function only translates
 * process output, cancellation, and exit status into the app error contract.
 */
export function runGarbro(options: GarbroRunnerOptions): Promise<GarbroRunResult> {
  if (options.signal?.aborted) {
    return Promise.reject(cancelledError());
  }

  return new Promise<GarbroRunResult>((resolve, reject) => {
    const useXp3Bridge = path.extname(options.archivePath).toLowerCase() === '.xp3'
      && Boolean(options.xp3BridgePath);
    const useProbe = !useXp3Bridge && options.useProbe === true && Boolean(options.probePath);
    const executable = useXp3Bridge
      ? options.xp3BridgePath!
      : useProbe
        ? options.probePath!
        : options.garbroPath;
    const args = useXp3Bridge || useProbe ? [options.archivePath] : ['-x', options.archivePath];
    const diagnosticOptions = executable === options.garbroPath
      ? options
      : { ...options, garbroPath: executable };
    let child;
    try {
      child = spawn(
        executable,
        args,
        { windowsHide: true, cwd: options.outputDir },
      );
    } catch (error) {
      reject(extractionError(`Unable to start GARbro: ${errorText(error)}`, error));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let aborted = false;

    const emitOutput = (value: unknown, isError = false): void => {
      const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
      if (isError) {
        stderr += text;
      } else {
        stdout += text;
      }

      const callback = options.onOutput ?? options.onProgress;
      if (callback) {
        // Keep callbacks useful for both line-oriented and chunk-oriented
        // consumers.  GARbro may emit either depending on the build.
        try {
          callback(text);
        } catch {
          // Progress reporting must never terminate extraction.
        }
      }
    };

    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort);
    };

    const fail = (error: AppError): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onAbort = (): void => {
      if (settled) {
        return;
      }
      aborted = true;
      // `kill` is intentionally best-effort: the process may have exited in
      // the same event-loop turn as the abort notification.
      try {
        child.kill();
      } catch {
        // The close handler below still settles the promise.
      }
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer | string) => emitOutput(chunk));
    child.stderr?.on('data', (chunk: Buffer | string) => emitOutput(chunk, true));
    child.once('error', (error: Error) => {
      if (aborted || options.signal?.aborted) {
        fail(cancelledError(error));
      } else {
        void writeDiagnostic(diagnosticOptions, `START FAILED: ${error.message}`, stdout, stderr);
        fail(extractionError(`GARbro failed to start: ${error.message}`, error));
      }
    });
    child.once('close', (code: number | null) => {
      void (async () => {
      if (settled) {
        return;
      }
      if (aborted || options.signal?.aborted) {
        await writeDiagnostic(diagnosticOptions, 'CANCELLED', stdout, stderr);
        fail(cancelledError());
        return;
      }
      const diagnostic = fatalDiagnostic(stderr);
      if (code !== 0 || diagnostic) {
        const detail = diagnostic || stderr.trim() || `GARbro exited with code ${String(code)}`;
        await writeDiagnostic(diagnosticOptions, `FAILED: ${detail}`, stdout, stderr);
        fail(extractionError(detail));
        return;
      }

      let extractedFiles = 0;
      try {
        extractedFiles = await countFiles(options.outputDir);
      } catch (error) {
        await writeDiagnostic(diagnosticOptions, `FAILED: cannot inspect output (${errorText(error)})`, stdout, stderr);
        fail(extractionError(`Unable to inspect GARbro output: ${errorText(error)}`, error));
        return;
      }
      const bridgeReportedNoAudio = useXp3Bridge && /Extracted\s+0\s+audio files/i.test(stdout);
      if (extractedFiles === 0 && !bridgeReportedNoAudio) {
        const detail = 'GARbro exited without extracting any files';
        await writeDiagnostic(diagnosticOptions, `FAILED: ${detail}`, stdout, stderr);
        fail(extractionError(detail));
        return;
      }

      settled = true;
      cleanup();
      await writeDiagnostic(diagnosticOptions, `SUCCESS: ${extractedFiles} files`, stdout, stderr);
      resolve({ exitCode: 0, stdout, stderr, extractedFiles });
      })();
    });
  });
}

/** Descriptive aliases for callers that name the operation explicitly. */
export const runGarbroExtraction = runGarbro;
export const executeGarbro = runGarbro;
export default runGarbro;
