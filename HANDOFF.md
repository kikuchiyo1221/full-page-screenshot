# Full Page Screenshot Extension — Architecture & Known Issues

## Overview

Chrome MV3 extension that captures a full page by scrolling the viewport and stitching
the screenshots together.

- **Tech**: Manifest V3, module service worker, `chrome.tabs.captureVisibleTab`
- **Dependencies**: none. Plain ES modules, no build step.
- **Flow**: popup / shortcut / context menu → service worker captures → editor tab opens

### Permission stance (read this before adding features)

The extension requests `activeTab`, `scripting`, `downloads`, `storage`,
`unlimitedStorage`, `alarms`, `contextMenus` — and **no host permissions at all**.

v1.0.2 shipped with `debugger` and `<all_urls>`; both are gone as of 1.1.1.
**Do not reintroduce them.** They passed review once, but the store's permission
policy tightens over time and both are avoidable here. In particular:

- Full-page capture must stay on `chrome.tabs.captureVisibleTab`. The DevTools Protocol
  (`Page.captureScreenshot`) needs the `debugger` permission, which review rejects when
  the same result is reachable through the extensions API — and it puts a
  "this browser is being debugged" bar on the user's screen.
- The selection overlay must stay an on-demand `scripting` injection. A declarative
  `content_scripts` entry would mean running code on every page the user visits, which
  requires host permissions.

Store-facing copy (single purpose, per-permission justifications, data disclosures) lives
in [STORE_SUBMISSION.md](STORE_SUBMISSION.md).

## Module map

```
scripts/background.js          Event wiring + capture orchestration only
scripts/capture/
  constants.js                 All timing / tuning values
  page-actions.js              Everything executed inside the page, via chrome.scripting
  full-page.js                 Scroll-and-stitch pipeline
  selection.js                 Overlay injection + drag-to-select round trip
  visible.js                   captureVisibleTab with quota throttling + tab focusing
  stitch.js                    Chunk placement (pure) + canvas compositing
scripts/content.js             Selection overlay (classic script — cannot be a module)
lib/                           Shared by the worker and the pages: bytes, pdf, settings,
                               i18n, filename
editor/                        editor.js (controller) + annotations.js + history.js
docs/privacy-policy.html       Hosted on GitHub Pages; must match manifest permissions
```

### Capture pipeline (`scripts/capture/full-page.js`)

```
1. focusTab()               captureVisibleTab only sees the window's ACTIVE tab
2. measurePageMetrics()     height before priming, for the infinite-scroll guard
3. primeLazyContent()       one scroll pass; forces eager loading, waits for images
4. measurePageMetrics()     height, viewport size, DPR after priming
5. clampPageHeight()        drop growth beyond 1.5x (infinite scroll appended content)
6. hideFixedElements()      so headers/footers don't repeat in every chunk
7. captureChunks()          scroll → captureVisibleTab, with overlap between chunks
8. restoreHiddenElements()  in a finally block
9. stitchChunks()           OffscreenCanvas composite → PNG data URL
```

**`captureVisibleTab` is quota limited** (roughly two calls per second; exceeding it
returns `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`). `visible.js` spaces calls out by
`CAPTURE_MIN_INTERVAL_MS` (550ms) and retries quota rejections. That interval is the
dominant cost of a long capture — lower it and captures start failing.

## Changed in 1.1.1 (permission reduction)

- `debugger` permission and the whole `DebuggerSession` layer removed; capture runs on
  `chrome.tabs.captureVisibleTab`.
- `<all_urls>` host permission removed; the extension runs on `activeTab` only.
- Declarative `content_scripts` removed; the overlay is injected on demand.
- `web_accessible_resources` removed (the editor is opened by the extension itself).
- Because captureVisibleTab only captures the active tab, `focusTab()` brings the target
  tab to the front first — visible in delayed captures if the user switched tabs.
- A capture that fails after the popup has closed had no way to say so. Failures now mark
  the toolbar icon with a badge and explain themselves in its tooltip; pages no extension
  can touch (`chrome://`, the Web Store) get a specific message rather than a raw API error.

## Fixed in the 1.0.3 refactor

- **Stitch loop could hang forever** on pages that refuse to scroll (scroll-locked body,
  inner scroll container, page shorter than measured). `captureChunks()` now stops when
  the scroll position stops advancing, and hard-stops at `MAX_CHUNKS`.
- **Selection crops were wrong at non-100% browser zoom.** The crop scale is now derived
  from the captured image width instead of assuming `window.devicePixelRatio`.
- **Editor bound its UI before the screenshot finished decoding.** `loadImage()` awaits
  the decode.
- **Dead code removed**: `saveImage()` / `convertImage()` / `dataURLtoBlob()` (no caller,
  and `URL.createObjectURL` is unavailable in an MV3 service worker anyway),
  `waitForNetworkIdle()` (no caller), `showStatus()` in the popup and its markup/CSS.
- **~110 lines of duplicated PDF-writing code** in `background.js` and `editor.js` are now
  `lib/pdf.js`.

## Known issues / gaps

1. **The popup's "Save / Copy" checkboxes do nothing.** They are still plumbed through to
   the editor as `captureOptions.saveDownload` / `saveClipboard`, but the editor ignores
   them and always waits for an explicit Save or Copy click. Auto-copy cannot work without
   a user gesture; auto-download would need a deliberate product decision.
2. **Capturing focuses the target tab.** Unavoidable with `captureVisibleTab`; noticeable
   only when a delayed capture fires after the user switched tabs.
3. **Long pages are slower than the old CDP path** because of the capture quota
   (~0.55s per viewport). A 20-viewport page takes roughly 15 seconds.
4. **Fixed/sticky elements are hidden for the whole capture**, so a sticky header appears
   in no chunk at all — not even the first one.
5. **The infinite-scroll guard is a heuristic.** A page that legitimately grows more than
   1.5x while lazy content loads will be truncated (`MAX_PAGE_GROWTH_RATIO`).
6. **Chrome-internal pages cannot be captured** (`chrome://`, the Web Store, other
   extensions' pages). `activeTab` is not granted there; the capture throws and is logged.
7. **Selection and delayed capture are not automated.** Both need a real user gesture
   (activeTab), which CDP cannot produce. `npm run test:e2e` covers the permission
   warnings, full-page capture, the editor's tools and every export format; the rest is
   in `E2E_MANUAL_TEST_CHECKLIST.md`.

## Testing

```bash
npm test          # pure logic
npm run test:e2e  # real headless Chrome: loads the extension, captures a 3000px fixture,
                  # and checks the stitched image pixel by pixel
```

`tests/e2e/` runs three phases against a real headless Chrome:

1. loads the *shipped* build and asserts the manifest, every extension page, the service
   worker, and — read out of `chrome://extensions`' shadow DOM — the permission warnings
   Chrome actually shows the user;
2. loads a throwaway copy with `<all_urls>` and captures a 3000px fixture, checking the
   stitched PNG pixel by pixel (activeTab needs a user gesture CDP cannot produce, so the
   test build stands in for one; the shipped manifest is never modified);
3. drives the editor with synthetic input — draw, undo, redo — and exports PNG, JPEG and
   PDF, checking each file's signature and filename.

Downloads land in the throwaway profile, never in the user's Downloads folder.
If you touch `manifest.json`, `full-page.js`, `stitch.js`, `page-actions.js` or the
editor, run it.

Then load the unpacked extension from `chrome://extensions` and walk through
`E2E_MANUAL_TEST_CHECKLIST.md`. A long page with lazy images and a dropdown menu
(e.g. a shopping search result page) exercises the tricky paths.

Two things to check specifically after any permission change:
- the install dialog must not ask to "read your browsing history" or "read data on all sites";
- no "this browser is being debugged" bar may appear during a capture.
