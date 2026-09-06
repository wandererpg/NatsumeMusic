# 右侧曲目表头液态玻璃改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将右侧曲目表头变成连续的主题感知液态玻璃表面，并移除指定的辅助文字，同时保持曲目滚动、双击播放和文件夹操作不变。

**Architecture:** 保持现有 `.main-content` 作为唯一滚动容器，继续使用 `TrackTable` 的原有表格结构；通过 `globals.css` 只增强表头单元格的半透明、模糊、高光和回退样式。文案清理限定在现有 React 节点，不改变排序、主题预览、导入和播放逻辑。

**Tech Stack:** React 18, TypeScript, CSS custom properties, CSS `backdrop-filter`/`color-mix`, Vitest, Testing Library。

---

### Task 1: 为曲目表头和主界面文案增加失败回归测试

**Files:**
- Modify: `tests/renderer/components.test.tsx:96-113`

- [ ] **Step 1: Write the failing test**

在 `renders the game list and track rows when data exists` 测试后增加以下测试，锁定表头仍存在且辅助文字不再渲染：

```tsx
  it('keeps track column headers while removing helper copy from the library shell', async () => {
    mockGalMusic([game], [track]);
    render(<App />);

    expect(await screen.findByRole('columnheader', { name: '曲目' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '格式' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '时长' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '大小' })).toBeInTheDocument();
    expect(screen.queryByText(/双击即可播放/)).not.toBeInTheDocument();
    expect(screen.queryByText('按曲目编号')).not.toBeInTheDocument();
    expect(screen.queryByText('仅保存在本机')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm test -- tests/renderer/components.test.tsx
```

Expected: FAIL because the current App and Sidebar still render “· 双击即可播放”、“按曲目编号”和“仅保存在本机”。

### Task 2: 为设置面板和液态玻璃契约增加失败回归测试

**Files:**
- Modify: `tests/renderer/scan-settings.test.tsx` near the existing `SettingsPanel` tests.
- Modify: `tests/renderer/track-layout.test.ts:8-14`

- [ ] **Step 1: Write the failing settings-copy test**

在设置保存测试前增加：

```tsx
  it('removes explanatory copy from the settings chrome', () => {
    render(<SettingsPanel settings={{
      libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25,
      themeId: 'rain-afterglow', background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
    }} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.queryByText(/导入文件会复制到这里/)).not.toBeInTheDocument();
    expect(screen.queryByText('即时预览')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Add CSS material assertions**

在 `right-side library layout` 测试中增加：

```ts
  it('uses a theme-aware liquid-glass surface for the table header', () => {
    expect(css).toMatch(/\.track-table\s*\{[^}]*border-collapse:\s*separate;/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*backdrop-filter:\s*blur\(18px\)/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(18px\)/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*color-mix\(in srgb, var\(--panel-strong\)/s);
    expect(css).toMatch(/@supports not \(backdrop-filter:\s*blur\(1px\)\)/s);
  });
```

- [ ] **Step 3: Run the focused tests and verify they fail for the intended reasons**

Run:

```powershell
npm test -- tests/renderer/scan-settings.test.tsx tests/renderer/track-layout.test.ts
```

Expected: the settings test fails on the two visible helper labels and the CSS test fails because the current table header has no blur, color-mix glass surface, or fallback block.

### Task 3: Remove the requested helper copy without changing behavior

**Files:**
- Modify: `src/renderer/src/App.tsx:491-495`
- Modify: `src/renderer/src/components/layout/Sidebar.tsx:111-118`
- Modify: `src/renderer/src/components/settings/SettingsPanel.tsx:123-133`
- Modify: `src/renderer/src/styles/globals.css:404,430-439,618`

- [ ] **Step 1: Simplify the track section heading**

Change the heading and tools to keep only the track count and the folder icon button:

```tsx
<div><h2 id="track-section-title">{copy.title}</h2><span>{tracks.length} 首曲目</span></div>
<div className="track-section__tools"><button className="icon-button icon-button--small" type="button" aria-label="打开曲目文件夹" title="打开曲目文件夹" onClick={() => currentTrack && void handleOpenFolder(currentTrack)}><FolderOpen size={15} aria-hidden="true" /></button></div>
```

The button and `onClick` behavior remain unchanged; remove the now-unused `.sort-label` rule with the other dead helper-copy style.

- [ ] **Step 2: Remove the offline sidebar note and settings helper copy**

Delete the `<p className="sidebar__offline-note">…</p>` node from `Sidebar.tsx`. In `SettingsPanel.tsx`, remove the `<small>导入文件会复制到这里，原始游戏目录不会被修改。</small>` node and change the appearance heading to omit only its trailing span:

```tsx
<div className="settings-section-heading"><div><p className="eyebrow">APPEARANCE</p><h3 id="appearance-title">软件外观</h3></div></div>
```

Do not remove the appearance radio group, background controls, or their preview callbacks. Remove `.sidebar__offline-note` and `.settings-field small` only if they have no remaining usages; preserve the general `.settings-field` layout by leaving its `gap` and label styles intact.

- [ ] **Step 3: Run the focused component tests**

Run:

```powershell
npm test -- tests/renderer/components.test.tsx tests/renderer/scan-settings.test.tsx
```

Expected: PASS for the helper-copy tests and all existing tests in both files.

### Task 4: Apply the liquid-glass header surface and verify the full change

**Files:**
- Modify: `src/renderer/src/styles/globals.css:437-440`
- Test: `tests/renderer/track-layout.test.ts`

- [ ] **Step 1: Give the table a zero-gap separate layout**

Change the table surface rule to:

```css
.track-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
```

This lets the first and last header cells form rounded ends without restoring an outer card or adding a nested scroll surface.

- [ ] **Step 2: Replace the opaque header background with the glass treatment**

Use the existing theme variables so every theme gets the same material behavior:

```css
.track-table th {
  position: sticky;
  z-index: 1;
  top: 0;
  height: 36px;
  padding: 0 12px;
  border-top: 1px solid color-mix(in srgb, var(--line-strong) 82%, transparent);
  border-bottom: 1px solid var(--line-strong);
  color: var(--muted-1);
  background: linear-gradient(180deg, color-mix(in srgb, var(--line-strong) 34%, transparent), transparent 68%), color-mix(in srgb, var(--panel-strong) 74%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--line-strong) 54%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--ink-0) 18%, transparent);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-align: left;
  text-transform: uppercase;
}
.track-table th:first-child { border-top-left-radius: 11px; }
.track-table th:last-child { border-top-right-radius: 11px; }
@supports not (backdrop-filter: blur(1px)) {
  .track-table th { background: var(--panel-strong); }
}
```

- [ ] **Step 3: Run focused layout tests**

Run:

```powershell
npm test -- tests/renderer/track-layout.test.ts
```

Expected: PASS for the existing single-scroll assertions and the new liquid-glass assertions.

- [ ] **Step 4: Run the complete validation set**

Run:

```powershell
npm test
npx tsc --noEmit
npm run build
```

Expected: all Vitest tests pass, TypeScript exits with code 0, and the Electron production build completes successfully.

- [ ] **Step 5: Perform a source-level copy audit**

Run:

```powershell
Select-String -Path 'src/renderer/src/**/*.tsx' -Pattern '仅保存在本机|双击即可播放|导入文件会复制到这里|原始游戏目录不会被修改|即时预览|按曲目编号' -CaseSensitive:$false
```

Expected: no output. The actual function labels and accessibility names such as “打开曲目文件夹” remain present.
