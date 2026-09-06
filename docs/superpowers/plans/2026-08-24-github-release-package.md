# GitHub Windows Release Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce clean Windows x64 release archives for NatsumeMusic and a GitHub-ready README that tells users how to install, run, import music, and verify the downloads.

**Architecture:** Reuse the already verified `release-v13` build as the source of truth. Create a new release staging directory containing only the NatsumeMusic installer or the complete portable runtime, compress each distribution separately, and keep legacy `GalMusic` artifacts out of the uploaded archives. Update only the root README for end-user distribution guidance; do not alter application code or silently change the package version.

**Tech Stack:** Electron 31, electron-builder/NSIS, PowerShell `Compress-Archive`, SHA-256 checksums, Markdown.

---

### Task 1: Audit the current project documentation and build output

**Files:**
- Read: `README.md`
- Read: `package.json`
- Read: `electron-builder.yml`
- Read: `docs/verification.md`
- Read: `release-v13/`

- [ ] **Step 1: Confirm the distributable source files**

Run:

```powershell
Get-Item release-v13/win-unpacked/NatsumeMusic.exe
Get-Item release-v13/NatsumeMusic-0.1.0-x64.exe
Get-Item release-v13/win-unpacked/resources/app.asar
```

Expected: all three files exist and the portable directory contains a `resources` directory beside `NatsumeMusic.exe`.

- [ ] **Step 2: Record the legacy artifacts that must not enter the GitHub archives**

Run:

```powershell
Get-ChildItem release-v13 -Force
```

Exclude `GalMusic-*.exe`, `GalMusic-*.blockmap`, `builder-debug.yml`, and `win-unpacked` itself from the release root archives unless they are explicitly selected as part of the portable runtime.

### Task 2: Create the GitHub-facing README

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Replace the development-first README with a user-first release guide**

The README must contain: the NatsumeMusic purpose, Windows installation options, the names and behavior of both archives, the portable `resources` requirement, the first-run flow, supported import paths, VNDB/Bangumi lookup behavior and failure states, theme customization, local data locations, troubleshooting, development commands, and the GitHub Release upload checklist.

- [ ] **Step 2: Cross-check every command and path against project files**

Verify the README commands against `package.json` and `electron-builder.yml`. Keep the version at `0.1.0`; packaging documentation does not authorize a version bump.

- [ ] **Step 3: Protect local-only data from source control**

Add ignore rules for historical `release-v*` directories, the generated `github-release-v1` assets, the temporary `github-release-staging-v1` directory, and local music folders `%USERPROFILE%/` and `已提取音乐/`. Do not delete any of these folders.

### Task 3: Stage and compress the clean Windows distributions

**Files:**
- Create: `github-release-v1/`
- Create: `github-release-v1/NatsumeMusic-0.1.0-windows-x64-portable.zip`
- Create: `github-release-v1/NatsumeMusic-0.1.0-windows-x64-installer.zip`

- [ ] **Step 1: Create a portable staging directory from `release-v13/win-unpacked`**

Copy only `NatsumeMusic.exe` and the complete `resources` directory into:

```text
github-release-v1/portable/NatsumeMusic-0.1.0-portable/
```

- [ ] **Step 2: Create an installer staging directory**

Copy only `release-v13/NatsumeMusic-0.1.0-x64.exe` into:

```text
github-release-v1/installer/NatsumeMusic-0.1.0-x64.exe
```

- [ ] **Step 3: Compress each staging directory**

Run `Compress-Archive` with `-CompressionLevel Optimal` so each ZIP has one clear top-level folder and does not include the project source tree, `node_modules`, or old release outputs.

### Task 4: Generate checksums and verify the archives

**Files:**
- Create: `github-release-v1/SHA256SUMS.txt`

- [ ] **Step 1: Compute SHA-256 hashes for both ZIP files**

Run:

```powershell
Get-FileHash github-release-v1/*.zip -Algorithm SHA256
```

- [ ] **Step 2: Write the exact hashes to `SHA256SUMS.txt`**

Use one line per archive in the form `<hash>  <filename>`.

- [ ] **Step 3: Inspect archive entries**

Verify the portable archive contains `NatsumeMusic.exe` and `resources/app.asar`, while the installer archive contains only `NatsumeMusic-0.1.0-x64.exe`. Search the ZIP listings for old `GalMusic` artifacts, project-root source folders, and project-root dependencies; the portable archive may legitimately contain Electron's unpacked `better-sqlite3` runtime under `resources/app.asar.unpacked/node_modules/` because the native module is required at runtime.

- [ ] **Step 4: Verify the release artifacts are self-consistent**

Recompute the hashes and compare them with `SHA256SUMS.txt`. Confirm the installer exists, the portable executable exists, and `README.md` documents the exact filenames.

### Task 5: Handoff for GitHub Release upload

**Files:**
- Read: `README.md`
- Read: `github-release-v1/`

- [ ] **Step 1: Report the four uploadable local files**

Provide clickable paths for the README, portable ZIP, installer ZIP, and checksum file. Explain that the two ZIPs and `SHA256SUMS.txt` belong in GitHub Release Assets, while `README.md` belongs at repository root.

- [ ] **Step 2: Record verification results**

Report archive names, archive contents, and the completed test/resource verification evidence without claiming that GitHub upload or publishing has already happened.
