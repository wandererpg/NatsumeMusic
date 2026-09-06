# 无彩色玻璃与全局字体颜色 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将曲目表头收敛为无彩色玻璃，并增加可持久化、可实时预览、可恢复主题默认值的全局主要文字颜色设置。

**Architecture:** 在现有 `AppSettings -> IPC -> SQLite settings` 链路中增加可选的 `fontColor` 字段；未设置时保持主题定义的 `--paper-0`，设置后由根元素内联样式覆盖 `--paper-0`，因此不需要逐个组件改色。`SettingsPanel` 将颜色与主题、背景一起纳入 `AppearanceDraft`，预览、取消和保存共用同一份外观快照。表头只保留中性透明层、白色边缘、镜面线和阴影，不再使用彩色渐变或彩色边缘光。

**Tech Stack:** React 18, TypeScript, SQLite/better-sqlite3, CSS custom properties, Vitest, Testing Library, Electron IPC。

---

### Task 1: 先锁定设置模型和无彩色玻璃的失败测试

**Files:**
- Modify: `tests/main/appearance-settings.test.ts`
- Modify: `tests/renderer/appearance.test.ts`
- Modify: `tests/renderer/scan-settings.test.tsx`
- Modify: `tests/renderer/app-appearance.test.tsx`
- Modify: `tests/renderer/track-layout.test.ts`

- [ ] **Step 1: Add persistence and CSS contract assertions**

在主进程外观设置测试中覆盖 `font_color` 的默认、合法值、非法值和保存；在 renderer 外观测试中断言 `toAppearanceStyle` 仅在有自定义颜色时覆盖 `--paper-0`。在布局测试中保留现有模糊/回退断言，并增加：

```ts
expect(css).not.toMatch(/\.track-table__head::before\s*\{[^}]*linear-gradient/s);
expect(css).not.toMatch(/\.track-table__head::after\s*\{[^}]*linear-gradient/s);
expect(css).not.toMatch(/\.track-table th\s*\{[^}]*linear-gradient/s);
expect(css).not.toMatch(/rgba\(120, 226, 206|rgba\(159, 139, 255|rgba\(246, 164, 192/);
expect(css).toMatch(/\.track-table th\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.055\)/s);
```

- [ ] **Step 2: Add the settings-panel color interaction test**

在 `tests/renderer/scan-settings.test.tsx` 中渲染 `SettingsPanel`，使用 `fontColor: null` 的设置，改变 `主要文字颜色` 输入，断言 `onAppearancePreview` 得到颜色；点击 `恢复主题颜色` 后断言得到 `fontColor: null`；保存后断言 `onSave` 的 payload 包含 `fontColor: null`。

- [ ] **Step 3: Add the app integration assertion**

在 `tests/renderer/app-appearance.test.tsx` 的外观集成测试中选择颜色，断言 `.app-shell` 的 style 包含 `--paper-0: #ff77aa`，并断言保存 payload 包含该颜色；再点击恢复按钮时断言预览样式回到主题变量而不是继续覆盖自定义颜色。

- [ ] **Step 4: Run the focused tests and confirm RED**

运行：

```powershell
npm test -- tests/main/appearance-settings.test.ts tests/renderer/appearance.test.ts tests/renderer/scan-settings.test.tsx tests/renderer/app-appearance.test.tsx tests/renderer/track-layout.test.ts
```

预期：测试因 `fontColor` 尚未进入设置模型/面板、表头仍含彩色渐变而失败；失败不能来自测试导入错误或类型语法错误。

### Task 2: Implement and test persisted font-color settings

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/settings.ts`
- Modify: `src/renderer/src/theme/appearance.ts`
- Test: `tests/main/appearance-settings.test.ts`
- Test: `tests/renderer/appearance.test.ts`

- [ ] **Step 1: Extend the shared settings contract**

Add `fontColor?: string | null` to `AppSettings` for compatibility with old renderer fixtures, and define `AppSettingsUpdate` with a required `fontColor: string | null` alongside the existing library, playback, theme, and background fields.

- [ ] **Step 2: Normalize and persist the color**

In `src/main/services/settings.ts`, add a six-digit hex parser:

```ts
function parseFontColor(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}
```

Save `font_color` as the normalized value or an empty string, and read it through the same parser so blank/invalid values return `null`. This keeps the generic setting API unchanged while making IPC saves safe.

- [ ] **Step 3: Let the root appearance style override only when customized**

Change `toAppearanceStyle` to accept `background` and optional `fontColor`; return the existing background variables and conditionally spread `{ '--paper-0': fontColor }` only for a valid non-null color. When `fontColor` is `null` or absent, do not return a `--paper-0` inline property so the active theme remains authoritative.

- [ ] **Step 4: Run the model tests GREEN**

运行：

```powershell
npm test -- tests/main/appearance-settings.test.ts tests/renderer/appearance.test.ts
```

预期：主进程默认/读取/保存和 renderer CSS 变量断言全部通过。

### Task 3: Add live preview, reset, and save behavior to settings UI

**Files:**
- Modify: `src/renderer/src/theme/themes.ts`
- Modify: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `tests/renderer/scan-settings.test.tsx`
- Modify: `tests/renderer/app-appearance.test.tsx`

- [ ] **Step 1: Add theme default primary colors**

Extend `ThemeDefinition` with `primaryTextColor` and provide the existing `--paper-0` value for each theme. The color input uses this value when no override is active, so “恢复主题颜色” visibly matches the selected theme.

- [ ] **Step 2: Extend the appearance draft and panel state**

Add required `fontColor: string | null` to `AppearanceDraft` and use `settings.fontColor ?? null` for local state. Include the field in the settings synchronization effect, preview callback, cancel snapshot, and save payload. Add:

```tsx
<div className="font-color-settings">
  <label className="font-color-settings__control">
    <span>主要文字颜色</span>
    <input
      type="color"
      value={fontColor ?? getTheme(themeId).primaryTextColor}
      onChange={(event) => previewAppearance(themeId, background, event.target.value)}
      aria-label="主要文字颜色"
    />
  </label>
  <button className="button button--ghost" type="button" onClick={() => previewAppearance(themeId, background, null)} disabled={isSaving || isCancelling}>
    恢复主题颜色
  </button>
</div>
```

- [ ] **Step 3: Thread the field through App preview and persistence**

Set `fontColor: null` in `defaultSettings`, merge it through `withAppearanceDefaults`, include it in `effectiveAppearance`, and let `saveSettings` keep it with the saved `AppSettings`. The existing cancel flow must restore the persisted `themeId`, `background`, and `fontColor` together.

- [ ] **Step 4: Run renderer settings tests GREEN**

运行：

```powershell
npm test -- tests/renderer/scan-settings.test.tsx tests/renderer/app-appearance.test.tsx
```

预期：颜色选择、实时预览、恢复主题颜色、保存和取消预览均通过，既有背景/主题测试不回归。

### Task 4: Replace colored glass layers with neutral material layers

**Files:**
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `tests/renderer/track-layout.test.ts`

- [ ] **Step 1: Remove colored gradients from the table header**

Keep the existing table geometry and SVG/filter fallback, but change the header material to neutral layers:

```css
.track-table__head::before {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.28), inset 0 -2px 2px rgba(0, 0, 0, 0.18), 0 12px 28px rgba(3, 10, 14, 0.2);
}
.track-table__head::after {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.035);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.08);
}
.track-table th {
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: url(#natsume-liquid-refraction) blur(14px) saturate(1.85) brightness(1.08);
}
```

The top specular pseudo-element becomes a border/inner-shadow line without a gradient. Preserve `@supports` and `prefers-reduced-transparency` fallbacks.

- [ ] **Step 2: Add restrained color-control layout styles**

Style `.font-color-settings` as a compact row with a labeled color swatch, a visible focus ring, and the reset button aligned with the existing background settings. Do not add a new panel or scroll container.

- [ ] **Step 3: Run layout and full validation**

运行：

```powershell
npm test -- tests/renderer/track-layout.test.ts
npm test
npx tsc --noEmit
npm run build
```

预期：所有测试、类型检查和生产构建通过；helper-copy 文案保持已清理状态，主内容仍只有一个滚动面。

### Task 5: Package and hand off the new build

**Files:**
- Create: `release-v7/win-unpacked/NatsumeMusic.exe`
- Create: `release-v7/NatsumeMusic-0.1.0-x64.exe`
- Modify: `C:\Users\HONOR\Desktop\NatsumeMusic.lnk`

- [ ] **Step 1: Build an isolated Windows package**

运行：

```powershell
npm run package:win -- --config.directories.output=release-v7
```

Preserve running `release-v5`/`release-v6` processes and do not overwrite either package.

- [ ] **Step 2: Point the desktop shortcut to release-v7**

Update only the existing `NatsumeMusic.lnk` target to `release-v7\win-unpacked\NatsumeMusic.exe`, then read the shortcut back and verify target and arguments.

- [ ] **Step 3: Audit the final package**

Verify both executable paths exist and tell the user that already-open windows need to be closed and relaunched from the desktop shortcut to load the new renderer bundle.
