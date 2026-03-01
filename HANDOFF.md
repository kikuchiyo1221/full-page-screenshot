# Full Page Screenshot Extension - Bug Fix Handoff

## Project Overview

Chrome MV3 extension for capturing full-page screenshots using a scroll-and-stitch approach.
- **Tech**: Chrome Extension Manifest V3, Service Worker, Chrome DevTools Protocol (CDP)
- **Key file**: `scripts/background.js` (all capture logic, 906 lines)
- **Architecture**: Popup triggers capture → background.js captures → opens editor tab

## Current Bugs (3 issues, all in `captureFullPage()` function, line 260-493)

### Bug 1: Debugger detaches during capture
**Error**: `Debugger is not attached to the tab with id: XXXXXXX`
**Where**: `sendDebuggerCommand()` calls inside the scroll-and-stitch loop (line 429)
**What happens**:
- `chrome.debugger.attach()` succeeds (line 362)
- During the capture loop, the debugger becomes detached
- `Page.captureScreenshot` command fails
- Falls back to visible-area-only capture (line 487)
- The "debugging this browser" info bar may stay visible permanently

**Root cause hypothesis**:
- Chrome may auto-detach the debugger when `chrome.scripting.executeScript()` is called on the same tab (lines 415-426 inside the capture loop)
- The user might dismiss the debugging info bar during capture
- There may be a race condition between scripting API and debugger API

**What was tried**:
- Added auto-reattach in `sendDebuggerCommand()` (line 559-571) — didn't fully fix it
- Moved debugger detach to right after screenshots complete (line 444-448) — bar still persists
- Added/removed 300ms delay after attachment — caused more detach issues

**Suggested approach**:
- Consider eliminating `chrome.scripting.executeScript()` during the capture loop entirely
- Use CDP commands (`Runtime.evaluate`, `Page.captureScreenshot`) for everything while debugger is attached, instead of mixing scripting API + debugger API
- Alternatively: use `chrome.tabs.captureVisibleTab()` instead of CDP for screenshots (no debugger needed), though it may have quality/timing differences

### Bug 2: Content appears duplicated (page captured twice)
**What happens**: On pages with infinite scroll (e.g., Rakuten search results), the lazy loading scroll pass triggers infinite scroll, loading more content and effectively doubling the page height.

**Current mitigation** (partially implemented):
- Records `initialPageHeight` before lazy loading scroll (line 267-271)
- Changed from 4-pass scroll to single pass (line 326-335)
- Caps `pageHeight` at `initialPageHeight * 1.5` (line 382-386)

**Status**: Partially fixed by the cap, but needs testing to confirm.

### Bug 3: Gray gaps between stitched screenshot chunks
**What happens**: Visible horizontal gray bands appear at regular intervals in the final stitched image.

**Current mitigation** (partially implemented):
- Added 5% overlap between chunks (line 439-441)
- Measures viewport AFTER debugger attachment

**Root cause hypothesis**:
- The debugger info bar reduces `window.innerHeight` but the scroll step uses the pre-bar measurement
- Fractional DPR or viewport height causes rounding gaps
- `Math.round(chunk.scrollY * dpr)` may round inconsistently

**Status**: Overlap added but untested due to Bug 1 blocking.

## Architecture of `captureFullPage()` (line 260-493)

```
1. Record initial page height                    [line 267-271]
2. Lazy loading scroll (single pass)             [line 274-359]
   - Force eager loading on all images
   - Scroll through page to trigger IntersectionObserver
   - Wait for images to load
3. Attach debugger                               [line 362-363]
4. Measure page dimensions                       [line 366-377]
5. Cap page height (infinite scroll protection)  [line 382-386]
6. Hide fixed/sticky elements via CSS injection  [line 391-405]
7. Scroll-and-stitch capture loop                [line 407-442]
   - For each chunk: scroll → read scrollY → capture screenshot
   - Uses overlap between chunks
8. Detach debugger                               [line 444-448]
9. Restore hidden elements                       [line 450-460]
10. Stitch chunks onto OffscreenCanvas           [line 462-474]
11. Convert to data URL and return               [line 476-480]
```

The debugger is needed ONLY for step 7 (`Page.captureScreenshot`). Steps 2, 4, 6, 9 use `chrome.scripting.executeScript()`. Mixing these two APIs on the same tab during steps 4-7 may cause the detach issue.

## Key Helper Functions

- `sendDebuggerCommand()` (line 559) — wraps CDP commands, has auto-reattach retry
- `attachDebugger()` / `detachDebugger()` (line 586/598) — Promise wrappers for `chrome.debugger`
- `base64ToBlob()` / `bytesToBase64()` (line 888/897) — image conversion helpers
- `captureVisibleTab()` (line 224) — simple fallback using `chrome.tabs.captureVisibleTab`

## File Structure

```
chrome-screenshot-extension/
  manifest.json          — MV3 manifest, permissions include "debugger"
  scripts/
    background.js        — All capture logic (THIS FILE HAS THE BUGS)
    content.js           — Selection mode overlay
    content.css          — Selection mode styles
  popup/
    popup.html/js/css    — Extension popup UI
  editor/
    editor.html/js/css   — Image editor (opened after capture)
  options/
    options.html/js/css  — Settings page
```

## Testing

1. Load unpacked extension from `chrome://extensions`
2. Navigate to a long page (e.g., Rakuten search results: `search.rakuten.co.jp`)
3. Click extension icon → "Capture Full Page"
4. Check `chrome://extensions` → extension errors for debugger errors
5. Verify: no content duplication, no gaps, debugging bar disappears after capture

## Environment

- Chrome (latest stable)
- macOS
- Extension loaded as unpacked for development
