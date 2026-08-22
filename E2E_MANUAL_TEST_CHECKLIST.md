# Chrome Screenshot Extension E2E Manual Checklist

## 0. Pre-check
1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Reload` on this extension.
4. Open any test page (recommended: a long page with images and a dropdown menu).

Pass criteria:
- Extension popup opens.
- No immediate error badge or crash.

## 1. Full Page Capture (Core)
1. Open popup.
2. Click `ページ全体をキャプチャ`.
3. Wait for editor tab to open.
4. Click `Save` in editor.

Expected:
- Editor opens with full-page image.
- Downloaded file opens correctly.

Fail if:
- Only viewport is captured.
- Editor does not open.

## 2. Selection Capture Success Path
1. Open popup.
2. Click `範囲を選択してキャプチャ`.
3. Drag a large area and release.
4. Wait for editor tab.

Expected:
- Selected region is captured and shown in editor.
- No hanging state.

Fail if:
- Nothing happens after selection.
- Overlay remains or UI freezes.

## 3. Selection Capture Cancel (Esc)
1. Start selection mode.
2. Press `Esc`.
3. Immediately try selection capture again.

Expected:
- First action cancels cleanly.
- Second attempt starts normally.

Fail if:
- Second attempt does not start.
- Extension appears stuck.

## 4. Selection Too Small Cancel
1. Start selection mode.
2. Drag a very small area (<10px) and release.
3. Start selection capture again.

Expected:
- Small selection cancels.
- Next selection works immediately.

Fail if:
- Capture flow hangs after small drag.

## 5. Delayed Capture (Visible Mode, Tab Integrity)
1. Open popup, set delay mode to `表示領域`.
2. Start delayed capture (e.g. 5s).
3. Before timer ends, switch to another tab in same window.
4. Wait for capture completion.

Expected:
- Capture is taken from the originally requested tab (not the tab you switched to).

Fail if:
- Wrong tab content is captured.

## 6. Delayed Capture (Full Page Mode)
1. Open popup, set delay mode to `フルページ`.
2. Start delayed capture.
3. Wait for editor tab.

Expected:
- Full-page result is captured after delay.

Fail if:
- Only visible area captured (unless explicit fallback error is seen).

## 7. PDF Export Validity
1. Capture any page and open editor.
2. Set format to `PDF`.
3. Click `Save`.
4. Open downloaded `.pdf` in Chrome or Preview.

Expected:
- File opens as a valid PDF.
- No "file is corrupted / unsupported format" error.

Fail if:
- PDF cannot open.
- File is actually PNG data with `.pdf` extension.

## 8. JPEG Quality Setting Applied
1. Open options page.
2. Set format default to JPEG and quality to low (e.g. 20), save.
3. Capture and save JPEG from editor.
4. Repeat with quality high (e.g. 95).
5. Compare file sizes.

Expected:
- High quality file is generally larger than low quality file.

Fail if:
- Size difference is negligible across multiple runs.

## 9. Repeated Selection Stability
1. Run selection capture success/cancel sequence 10+ times:
   - success
   - Esc cancel
   - small-selection cancel
2. Observe responsiveness.

Expected:
- No progressive slowdown.
- No dead state requiring extension reload.

Fail if:
- Behavior degrades over repetitions.

## 10. Regression Quick Sweep
1. Test shortcut `Alt+Shift+S`.
2. Test shortcut `Alt+Shift+A`.
3. Test context menu full-page capture.
4. Test context menu selection capture.

Expected:
- Each entry point starts the expected mode.

---

## Result Template
Use this table while testing:

| Case | Result (PASS/FAIL) | Notes | Screenshot/Video |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |
| 4 |  |  |  |
| 5 |  |  |  |
| 6 |  |  |  |
| 7 |  |  |  |
| 8 |  |  |  |
| 9 |  |  |  |
| 10 |  |  |  |

## 10. Permissions (Chrome Web Store review blockers)

Most of this section is automated — `npm run test:e2e` asserts the permission set and the
stitched output against a real headless Chrome. Run the manual steps below as well after
any change to `manifest.json` or to how the capture works, because the automated run
cannot see the install dialog or the debugging info bar.
v1.0.2 was rejected for over-broad permissions, so these are release blockers, not nits.

1. Remove the extension, then load it again as an unpacked extension.
2. Read the permission dialog / the "Details" page permission list.
3. Run a full page capture on a long page and watch the top of the browser window.
4. Open `chrome://extensions` itself and try to capture it.

Pass criteria:
- The permission list does **not** mention "Read your browsing history" or
  "Read and change all your data on all websites".
- No "this browser is being debugged by software" bar appears at any point.
- `manifest.json` requests no `host_permissions`, no `debugger`, and no `content_scripts`.
- Capturing a `chrome://` page fails quietly (an error in the service worker console),
  without leaving the page scrolled to the bottom or with elements still hidden.

Fail if:
- Any host permission or the debugger permission is present.
- The debugging info bar appears (it also shifts the viewport and breaks stitching).
