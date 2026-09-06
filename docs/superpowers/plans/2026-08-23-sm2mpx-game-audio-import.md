# GalMusic SM2MPX 游戏音频导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以直接选择《家族計画 ～追憶～》这类使用 `SM2MPX10` 无扩展名容器的完整游戏目录，默认导入其中的 `WMSC` 音乐，并通过现有选项按需导入 `VOICE1/VOICE2`。

**Architecture:** 保留现有的 SM2MPX 文件头识别、`WMSC/VOICE*` 分类、`GARbro.Probe.exe` 解包和普通音频入库链路；本次实现只补齐扫描窗口的格式可发现性、补强格式契约测试，并对真实 `WMSC` 资源做一次 Probe 验证。普通 `.xp3/.rpa/.arc/.pak` 归档流程不改变。

**Tech Stack:** Electron 31, React 18, TypeScript 5.6, Vitest, Testing Library, GARbro Probe, better-sqlite3.

---

### Task 1: Lock the SM2MPX header classification contract

**Files:**
- Create: `tests/main/formats.test.ts`
- Verify: `src/main/services/formats.ts`
- Verify: `src/main/services/extractor.ts`

- [x] **Step 1: Write the format regression tests**

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectSm2MpxArchive } from '../../src/main/services/formats';

function sm2MpxHeader(name: string): Buffer {
  const header = Buffer.alloc(32);
  header.write('SM2MPX10', 0, 'ascii');
  header.write(name, 16, 'ascii');
  return header;
}

describe('SM2MPX containers', () => {
  it.each([
    ['WMSC', 'music'],
    ['VOICE1', 'voice'],
    ['VOICE2', 'voice'],
    ['SE', 'other'],
  ] as const)('classifies %s as %s', async (name, expected) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-sm2mpx-format-'));
    try {
      await mkdir(root, { recursive: true });
      const filePath = path.join(root, name);
      await writeFile(filePath, sm2MpxHeader(name));
      await expect(inspectSm2MpxArchive(filePath)).resolves.toBe(expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Run `npm test -- tests/main/formats.test.ts` and verify the regression contract**

Expected result after the test file is added: the four cases pass against the existing implementation. If the test fails, stop and correct the fixture or inspect the header offsets before changing production code; the source already contains the required classifier.

- [x] **Step 3: Audit the extraction selection test**

Run `npm test -- tests/main/extractor.test.ts tests/main/importer.test.ts` and verify the existing tests cover both of these behaviors:

```text
SM2MPX10 + WMSC → GARbro.Probe.exe
SM2MPX10 + WMSC → extracted when deepScan=true
SM2MPX10 + VOICE1/SE → skipped when includeVoice=false
```

Do not introduce a second decoder or rename the source files. The production chain in `formats.ts`, `extractor.ts`, and `importer.ts` is the implementation to preserve.

### Task 2: Make the folder-first import flow explain SM2MPX clearly

**Files:**
- Modify: `tests/renderer/scan-settings.test.tsx`
- Modify: `src/renderer/src/components/scanner/ScanDialog.tsx`

- [x] **Step 1: Add a failing discoverability test**

Append a test to `tests/renderer/scan-settings.test.tsx` that mounts the real dialog with its existing API fixture and asserts the default import choices plus the new format hint:

```tsx
it('explains SM2MPX music containers and keeps music-only import defaults', async () => {
  window.galMusic = {
    selectFolder: vi.fn().mockResolvedValue('D:/BaiduNetdiskDownload/h/家族計画 ～追憶～'),
    getSettings: vi.fn().mockResolvedValue({
      libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop',
      lastTrackId: null, voiceThresholdSeconds: 25,
    }),
    startScan: vi.fn(),
    onScanProgress: vi.fn().mockReturnValue(() => undefined),
    onScanResult: vi.fn().mockReturnValue(() => undefined),
  } as unknown as typeof window.galMusic;

  render(<ScanDialog onClose={vi.fn()} />);

  expect(await screen.findByText(/SM2MPX.*WMSC/)).toBeInTheDocument();
  expect(await screen.findByRole('checkbox', { name: /导入语音/ })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: /深度扫描归档/ })).toBeChecked();
});
```

- [x] **Step 2: Run `npm test -- tests/renderer/scan-settings.test.tsx` and confirm the new text assertion fails**

The expected failure is that the current dialog only says it supports nested directories and `.xp3/.rpa/.arc/.pak`; it does not mention `SM2MPX` or `WMSC`.

- [x] **Step 3: Update only the user-facing scan hints**

In `ScanDialog.tsx`, keep the existing default state and IPC payload unchanged, but replace the two relevant hints with these exact meanings:

```tsx
<span>支持嵌套目录、普通归档与无扩展名游戏容器</span>
<small>自动调用 GARbro 读取 .xp3 / .rpa / .arc / .pak，以及 SM2MPX/WMSC 音乐容器</small>
<small>{hasValidVoiceThreshold ? `${voiceThresholdSeconds} 秒` : '阈值'}及以下或无法识别时长的音频会归为语音；VOICE1/VOICE2 默认不导入</small>
```

The copy must also make clear that the user selects the whole game folder, `deepScan` remains enabled by default, and `includeVoice` remains disabled by default. Do not add a separate file picker for `WMSC`; the existing folder-first flow is intentional.

- [x] **Step 4: Re-run the focused renderer tests**

Run `npm test -- tests/renderer/scan-settings.test.tsx` and expect all scan/settings tests to pass, including the new SM2MPX discoverability case and the existing voice payload assertion.

### Task 3: Document the confirmed import path and user operation

**Files:**
- Modify: `docs/GalMusic-实际运行逻辑.md`
- Verify: `docs/superpowers/specs/2026-08-23-sm2mpx-game-audio-import-design.md`

- [x] **Step 1: Add the real-resource confirmation to the import documentation**

Under the SM2MPX subsection, record the confirmed resource shape and user action:

```markdown
对《家族計画 ～追憶～》目录的实测：选择整个游戏目录后，深度扫描发现无扩展名 `WMSC`；`GARbro.Probe.exe WMSC` 可退出成功并解出 27 个 `.ogg`。`VOICE1`、`VOICE2` 只有打开“导入语音”后才会解包，`SE`、`GGD`、`GGD2`、`ISF`、`DATA` 不作为音乐容器导入。

因此用户不需要重命名或手动解包文件：在“导入游戏音乐”中选择游戏根目录，保持“深度扫描归档”开启即可；只导入音乐时保持“导入语音”关闭。
```

- [x] **Step 2: Keep the operational flow consistent with implementation**

Verify the documentation still states that extraction goes to an application-created temporary directory, the original game directory is not modified, OGG files re-enter normal scanning/classification/copy/database insertion, and failed containers are reported without blocking other candidates.

- [x] **Step 3: Run a placeholder and terminology review**

Run:

```powershell
Select-String -Path 'docs\GalMusic-实际运行逻辑.md','docs\superpowers\specs\2026-08-23-sm2mpx-game-audio-import-design.md' -Pattern 'TBD|TODO|待定|占位'
```

Expected result: no matches. Keep `SM2MPX10`, `WMSC`, `VOICE1/VOICE2`, and `GARbro.Probe.exe` spelling consistent across code, tests, and docs.

### Task 4: Verify the actual WMSC resource and production resources

**Files:**
- Verify: `resources/tools/garbro/GARbro.Probe.exe`
- Verify: `resources/tools/garbro/Formats.dat`
- Verify: `scripts/verify-resources.mjs`

- [x] **Step 1: Probe the real music container in an isolated temporary output directory**

Use the actual source file without modifying the game directory:

```powershell
$probe = Resolve-Path '.\resources\tools\garbro\GARbro.Probe.exe'
$source = 'D:\BaiduNetdiskDownload\h\家族計画 ～追憶～\WMSC'
$out = Join-Path ([System.IO.Path]::GetTempPath()) ('galmusic-sm2mpx-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $out | Out-Null
try {
  $oldLocation = Get-Location
  Set-Location -LiteralPath $out
  $probeOutput = (& $probe $source 2>&1 | Out-String)
  $exitCode = $LASTEXITCODE
  Set-Location -LiteralPath $oldLocation
  $ogg = @(Get-ChildItem -LiteralPath $out -Filter '*.ogg' -File)
  [pscustomobject]@{ ExitCode = $exitCode; OggCount = $ogg.Count; ProbeOutput = $probeOutput.Trim() } | Format-List
  if ($exitCode -ne 0) { throw "GARbro Probe exited with $exitCode" }
  if ($ogg.Count -ne 27) { throw "Expected 27 OGG files, got $($ogg.Count)" }
} finally {
  Remove-Item -LiteralPath $out -Recurse -Force
}
```

Expected result: exit code `0` and exactly 27 extracted `.ogg` files. If the source folder is unavailable, report that as an environment verification gap; do not weaken the application behavior or add a fallback decoder.

- [x] **Step 2: Verify bundled GARbro resources**

Run `npm run verify:resources` and expect the required GARbro executables, `ArcFormats.dll`, `Formats.dat`, and `extract-rpa.mjs` checks to pass.

- [x] **Step 3: Build and package the application**

Run `npm run build` and expect main, preload, and renderer bundles to complete. Then run `npm run package:win` if the Electron cache is available; inspect the packaged `resources` directory and verify `GARbro.Probe.exe` and `Formats.dat` are present.

### Task 5: Run the complete verification suite and hand off

**Files:**
- Verify: all changed files above

- [x] **Step 1: Run the complete automated suite**

Run `npm test` and expect every test file to pass, including the SM2MPX classification, importer selection, and renderer discoverability tests.

- [x] **Step 2: Run the type check**

Run `npx tsc --noEmit` and expect exit code `0`.

- [x] **Step 3: Review the diff and temporary artifacts**

Inspect the changed files with `git diff` when a Git repository is available; this project currently has no Git repository, so use `Get-Content`/`Select-String` plus the test/build results as the review checkpoints. Remove only the exact diagnostic output directory created for the real Probe check, and confirm no file was written under `D:\BaiduNetdiskDownload\h\家族計画 ～追憶～`.

- [x] **Step 4: Report the user operation**

Hand off the final behavior in one short instruction: choose the whole game folder, leave deep scan on, leave voice import off for music-only import, then start the import. Mention that the original folder stays unchanged and that the app extracts to a temporary directory before copying the OGG files into the library.

> **Repository note:** This workspace has no Git repository, so there is no commit checkpoint; verification is recorded through focused tests, full tests, type checking, resource validation, and production build output.
