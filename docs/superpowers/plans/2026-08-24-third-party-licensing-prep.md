# Third-Party Licensing Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a transparent, reviewable licensing package for NatsumeMusic's source repository and Windows release without making an unapproved choice of license for the NatsumeMusic code itself or claiming unverified terms for bundled GARbro dependencies.

**Architecture:** Keep the NatsumeMusic project license as an explicit user decision. Add a third-party notice document that separates verified attributions from items requiring provenance checks, preserve the Electron/Chromium notices already shipped by Electron, and copy available npm license files into a dedicated `licenses/` tree. The release process will treat the notice files as both repository documentation and assets to review before publishing.

**Tech Stack:** Electron 31.7.7, electron-builder, npm package metadata, GARbro/.NET assemblies, Markdown, plain-text license files.

---

### Task 1: Audit the exact bundled components

**Files:**
- Read: `package.json`
- Read: `package-lock.json`
- Read: `resources/tools/garbro/`
- Read: `release-v13/win-unpacked/LICENSE.electron.txt`
- Read: `release-v13/win-unpacked/resources/LICENSES.chromium.html`

- [ ] **Step 1: Record direct npm dependency versions and license fields**

Read each installed package's `package.json`, not only the semver range in the root manifest. Record name, resolved version, license field, repository URL, and whether the package is runtime or build-time.

- [ ] **Step 2: Record GARbro binary and assembly identities**

Record the file name and assembly/file version for every bundled GARbro DLL/EXE. Group files by upstream component, but do not infer a license from the filename or from the GARbro core license.

- [ ] **Step 3: Separate verified facts from unresolved provenance**

Mark GARbro core as MIT based on the official upstream `LICENSE`, mark Electron/Chromium notices as already shipped, and mark every bundled dependency whose exact upstream package/release cannot yet be proven as `REVIEW REQUIRED`.

### Task 2: Add repository notice materials

**Files:**
- Create: `THIRD-PARTY-NOTICES.draft.md`
- Create: `licenses/README.md`
- Create: `licenses/npm/`
- Create: `licenses/electron/`

- [ ] **Step 1: Write a factual third-party notice draft**

Include the component, version/commit, license, copyright/attribution, source URL, bundled path, and verification status. Explicitly state that the document is not complete until the GARbro bundle's dependency licenses and the NatsumeMusic project license are reviewed.

- [ ] **Step 2: Preserve Electron's notices outside ignored build directories**

Copy `LICENSE.electron.txt` and `LICENSES.chromium.html` from the verified `release-v13/win-unpacked` output into `licenses/electron/` so the source repository has a stable copy even though `release-v13` is ignored by `.gitignore`.

- [ ] **Step 3: Copy available npm license files**

Copy the installed license files for `better-sqlite3`, `howler`, `lucide-react`, `react`, `react-dom`, `uuid`, and `zustand` into `licenses/npm/` with versioned file names. Link `music-metadata` to its official source/license until an exact license text is obtained.

### Task 3: Make the legal materials discoverable

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a licensing section to README**

Link the notice draft and license directory, explain that GARbro and its bundled libraries are third-party components, and tell release maintainers not to publish the draft as final compliance evidence until the review-required items are resolved.

- [ ] **Step 2: Document the two decisions that require the owner**

State that the owner must choose the NatsumeMusic code license and confirm the provenance/release version of the GARbro binaries. Do not create a root `LICENSE` file until the owner selects the project license.

### Task 4: Final release gate

**Files:**
- Read: `THIRD-PARTY-NOTICES.draft.md`
- Read: `licenses/`
- Read: `github-release-v1/`

- [ ] **Step 1: Check that release assets contain or link to the notices**

Ensure the portable package retains Electron's runtime notices and add the repository notice files to the GitHub Release source/release notes as appropriate. Do not claim that a ZIP is legally cleared solely because automated tests pass.

- [ ] **Step 2: Obtain owner confirmation before finalizing**

Ask the owner to select the NatsumeMusic project license and provide the GARbro source archive/release URL or commit used to build `resources/tools/garbro`. Then replace the draft filename with a final notice only after the dependency table is complete.
