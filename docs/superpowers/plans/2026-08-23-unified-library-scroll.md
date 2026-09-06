# GalMusic 右侧音乐库面板合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the nested track-list card and make the right-side library content use one outer scroll surface while preserving virtualized rendering for large libraries.

**Architecture:** `.main-content` remains the production page scroller. `App` passes its ref to `TrackTable`, which listens to the external scroll target and converts the outer scroll position into the table-local virtual window; standalone `TrackTable` usage keeps the existing internal-scroller fallback. CSS removes the track-list card surface and leaves the heading, filters, bulk toolbar, and rows in one continuous right-side panel.

**Tech Stack:** Electron 31, React 18, TypeScript 5.6, Vitest, Testing Library, CSS custom properties.

---

### Task 1: Add red tests for one outer scroll surface

**Files:**
- Create: `tests/renderer/track-layout.test.ts`
- Modify: `tests/renderer/track-table-virtualization.test.tsx`
- Modify: `tests/renderer/components.test.tsx`

- [ ] **Step 1: Add the CSS contract test**

Create `tests/renderer/track-layout.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('right-side library layout', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/src/styles/globals.css'), 'utf8');

  it('keeps scrolling on main content and removes the nested track card surface', () => {
    expect(css).toMatch(/\.main-content\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*overflow-y:\s*visible;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*background:\s*transparent;/s);
    expect(css).not.toMatch(/\.track-table-wrap\s*\{[^}]*max-height:/s);
  });
});
```

- [ ] **Step 2: Add the failing external-scroll virtualization test**

Append this test to `tests/renderer/track-table-virtualization.test.tsx`. The mocked geometry represents a table whose top is at the top of the outer right-side panel after the user has scrolled down:

```tsx
it('follows the outer library panel when the table is embedded in it', async () => {
  const tracks = Array.from({ length: 500 }, (_, index) => makeTrack(index));
  const outerScroller = document.createElement('main');
  Object.defineProperty(outerScroller, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(outerScroller, 'scrollTop', { configurable: true, writable: true, value: 0 });
  vi.spyOn(outerScroller, 'getBoundingClientRect').mockReturnValue({
    top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600,
  } as DOMRect);
  const scrollContainerRef = { current: outerScroller };

  render(<TrackTable tracks={tracks} scrollContainerRef={scrollContainerRef} />);
  const tableScroller = screen.getByTestId('track-table');
  let tableTop = 0;
  vi.spyOn(tableScroller, 'getBoundingClientRect').mockImplementation(() => ({
    top: tableTop, bottom: tableTop + 600, left: 0, right: 800, width: 800, height: 600,
  } as DOMRect));

  outerScroller.scrollTop = 29_400;
  tableTop = -29_400;
  fireEvent.scroll(outerScroller);

  await waitFor(() => expect(screen.getByTestId('track-row-track-499')).toBeInTheDocument());
  expect(screen.queryByTestId('track-row-track-0')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Add the App composition assertion**

In `tests/renderer/components.test.tsx`, add this test after the existing track-row rendering test:

```tsx
it('places the track table inside the single right-side main content scroller', async () => {
  mockGalMusic([game], [track]);
  render(<App />);

  const mainContent = await screen.findByTestId('main-content');
  const table = await screen.findByTestId('track-table');
  expect(mainContent).toContainElement(table);
  expect(mainContent).toHaveAttribute('data-scroll-surface', 'library');
});
```

- [ ] **Step 4: Run the focused tests and verify they fail for the missing behavior**

Run:

```powershell
npm test -- tests/renderer/track-layout.test.ts tests/renderer/track-table-virtualization.test.tsx tests/renderer/components.test.tsx
```

Expected result: the CSS contract fails because `.track-table-wrap` still has its own max-height/card styling, the external-scroll test cannot use the new prop, and the App test cannot find `data-testid="main-content"`.

### Task 2: Make TrackTable follow an external scroll container

**Files:**
- Create: `src/renderer/src/components/library/track-scroll.ts`
- Modify: `src/renderer/src/components/library/TrackTable.tsx`

- [ ] **Step 1: Add the geometry helper used by the virtual window**

Create `src/renderer/src/components/library/track-scroll.ts`:

```ts
export interface TrackScrollMetrics {
  scrollTop: number;
  viewportHeight: number;
}

export function measureExternalTrackScroll(
  outerScroller: HTMLElement,
  trackTable: HTMLElement,
  fallbackHeight: number,
): TrackScrollMetrics {
  const outerRect = outerScroller.getBoundingClientRect();
  const tableRect = trackTable.getBoundingClientRect();
  const tableOffset = tableRect.top - outerRect.top + outerScroller.scrollTop;
  const scrollTop = Math.max(0, outerScroller.scrollTop - tableOffset);
  const visibleHeight = Math.min(
    outerScroller.clientHeight,
    Math.max(0, outerRect.bottom - tableRect.top),
  );

  return {
    scrollTop,
    viewportHeight: visibleHeight || fallbackHeight,
  };
}
```

- [ ] **Step 2: Extend the TrackTable contract**

Update the React import and props in `TrackTable.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { measureExternalTrackScroll } from './track-scroll';

export interface TrackTableProps {
  // existing props...
  scrollContainerRef?: RefObject<HTMLElement | null>;
}
```

Destructure `scrollContainerRef` alongside the existing props. Keep the internal `scrollerRef`; it remains the table element used for geometry and the fallback scroll target.

- [ ] **Step 3: Replace the local-only measurement effect with external-first measurement**

Use one update function that reads the external target when mounted and otherwise reads the existing wrapper:

```tsx
useEffect(() => {
  const tableScroller = scrollerRef.current;
  const outerScroller = scrollContainerRef?.current;
  const scrollTarget = outerScroller ?? tableScroller;
  if (!tableScroller || !scrollTarget) return undefined;

  const updateScrollMetrics = () => {
    if (outerScroller) {
      const metrics = measureExternalTrackScroll(
        outerScroller,
        tableScroller,
        TRACK_LIST_FALLBACK_HEIGHT,
      );
      setScrollTop(metrics.scrollTop);
      setViewportHeight(metrics.viewportHeight);
      return;
    }
    setScrollTop(tableScroller.scrollTop);
    setViewportHeight(tableScroller.clientHeight || TRACK_LIST_FALLBACK_HEIGHT);
  };

  updateScrollMetrics();
  scrollTarget.addEventListener('scroll', updateScrollMetrics, { passive: true });
  if (typeof ResizeObserver === 'undefined') {
    return () => scrollTarget.removeEventListener('scroll', updateScrollMetrics);
  }
  const observer = new ResizeObserver(updateScrollMetrics);
  observer.observe(scrollTarget);
  observer.observe(tableScroller);
  return () => {
    scrollTarget.removeEventListener('scroll', updateScrollMetrics);
    observer.disconnect();
  };
}, [scrollContainerRef]);
```

Keep the existing wrapper `onScroll` handler as the fallback when no external ref is present. In the list-order reset effect, reset whichever scroll target is active and set `scrollTop(0)` state:

```tsx
const scrollTarget = scrollContainerRef?.current ?? scrollerRef.current;
if (scrollTarget) scrollTarget.scrollTop = 0;
setScrollTop(0);
```

- [ ] **Step 4: Run the focused virtualization tests and verify they pass**

Run:

```powershell
npm test -- tests/renderer/track-table-virtualization.test.tsx
```

Expected result: both the existing internal-scroll tests and the new external-scroll test pass, with the external test showing the final track row after scrolling the outer element.

### Task 3: Wire the outer panel and remove the nested card styling

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/globals.css`

- [ ] **Step 1: Pass the main-content ref into TrackTable**

Add a stable ref near the other App refs:

```tsx
const mainContentRef = useRef<HTMLElement>(null);
```

Update the main element and TrackTable call:

```tsx
<main
  ref={mainContentRef}
  className="main-content"
  id="main-content"
  data-testid="main-content"
  data-scroll-surface="library"
>
```

```tsx
<TrackTable
  tracks={tracks}
  scrollContainerRef={mainContentRef}
  // existing props remain unchanged
/>
```

- [ ] **Step 2: Remove the inner table scroll surface**

Replace the current `.track-table-wrap` declaration in `globals.css`:

```css
.track-table-wrap {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
```

Leave `.main-content` as the scroll owner with its existing `overflow: auto`, thin scrollbar, padding, and theme background layering. Do not change table row heights or column widths, so the virtual row calculations remain valid.

- [ ] **Step 3: Keep the sticky header attached to the outer scroll**

Retain the current sticky table header declaration and make its surface transparent enough to blend with the right-side panel:

```css
.track-table th {
  position: sticky;
  z-index: 1;
  top: 0;
  background: var(--panel-strong);
}
```

Keep the border-bottom and text tokens from the existing rule so column labels remain readable while the user scrolls.

- [ ] **Step 4: Run the focused layout and component tests**

Run:

```powershell
npm test -- tests/renderer/track-layout.test.ts tests/renderer/track-table-virtualization.test.tsx tests/renderer/components.test.tsx
```

Expected result: all focused tests pass, including the CSS contract, outer-scroll virtual window, App composition, existing row playback, and existing filtering assertions.

### Task 4: Verify the complete renderer and production build

**Files:**
- Verify: `src/renderer/src/App.tsx`
- Verify: `src/renderer/src/components/library/TrackTable.tsx`
- Verify: `src/renderer/src/components/library/track-scroll.ts`
- Verify: `src/renderer/src/styles/globals.css`
- Verify: `tests/renderer/track-layout.test.ts`

- [ ] **Step 1: Run the complete test suite**

Run `npm test` and expect every test file to pass, including the new layout and external-scroll tests.

- [ ] **Step 2: Run the type checker**

Run `npx tsc --noEmit` and expect exit code `0`.

- [ ] **Step 3: Build the renderer and Electron bundles**

Run `npm run build` and expect main, preload, and renderer bundles to complete without TypeScript or Vite errors.

- [ ] **Step 4: Package the Windows release**

Run `npm run package:win` after closing any running GalMusic instance that locks `release/win-unpacked`. Expect the existing installer and unpacked executable to be regenerated with the new renderer bundle.

- [ ] **Step 5: Perform the manual visual check**

Open the packaged app, choose a game with enough tracks to scroll, and verify:

```text
右侧只有一条纵向滚动条
“全部音乐”标题、分类按钮和曲目行属于同一块内容
曲目表没有独立边框、圆角、背景或第二条滚动条
向下滚动右侧外面板时，曲目表连续显示后续曲目
曲目表表头在滚动时仍清晰可见
```

> **Repository note:** This workspace has no Git repository, so there is no commit checkpoint; focused tests, full tests, type checking, build, packaging, and manual visual verification are the handoff checkpoints.
