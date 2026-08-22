// Viewport capture via chrome.tabs.captureVisibleTab.
//
// This is deliberately NOT the DevTools Protocol: Page.captureScreenshot would
// require the "debugger" permission, which Chrome Web Store review rejects when
// the same result is reachable through the extensions API. The trade-off is the
// quota below — captureVisibleTab is rate limited, so calls are throttled.

import {
  CAPTURE_MIN_INTERVAL_MS,
  CAPTURE_QUOTA_RETRIES,
  TAB_FOCUS_SETTLE_MS
} from './constants.js';

/** Timestamp of the last capture, used to keep calls under Chrome's quota. */
let lastCaptureAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requestCapture(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error('captureVisibleTab returned no data'));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

function isQuotaError(error) {
  return /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(error.message || '');
}

/**
 * Capture the active tab of `windowId` as a PNG data URL.
 *
 * Chrome caps captureVisibleTab at a couple of calls per second and rejects the
 * rest, so calls are spaced out and a quota rejection is retried rather than
 * surfacing as a failed capture.
 */
export async function captureVisibleTab(windowId = null) {
  for (let attempt = 0; ; attempt += 1) {
    const waitFor = lastCaptureAt + CAPTURE_MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await sleep(waitFor);

    try {
      const dataUrl = await requestCapture(windowId);
      lastCaptureAt = Date.now();
      return dataUrl;
    } catch (error) {
      lastCaptureAt = Date.now();
      if (!isQuotaError(error) || attempt >= CAPTURE_QUOTA_RETRIES) throw error;
      console.warn(`captureVisibleTab hit the quota, retrying (${attempt + 1})`);
    }
  }
}

/**
 * captureVisibleTab only ever captures the *active* tab of a window, so bring
 * the target tab to the front first. Delayed captures in particular can fire
 * after the user has switched tabs.
 */
export async function focusTab(tab) {
  const current = await chrome.tabs.get(tab.id);
  if (!current.active) {
    await chrome.tabs.update(tab.id, { active: true });
    await sleep(TAB_FOCUS_SETTLE_MS); // Let the newly shown tab paint.
  }
  return current.windowId;
}

/** Capture a specific tab, focusing it first if necessary. */
export async function captureTab(tab) {
  const windowId = await focusTab(tab);
  return captureVisibleTab(windowId);
}
