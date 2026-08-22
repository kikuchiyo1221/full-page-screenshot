// Full-page capture: prime lazy content, then scroll the page one viewport at a
// time and stitch the screenshots together.

import { MAX_CHUNKS, MAX_PAGE_GROWTH_RATIO } from './constants.js';
import {
  hideFixedElements,
  measurePageMetrics,
  primeLazyContent,
  restoreHiddenElements,
  scrollTo
} from './page-actions.js';
import { nextScrollTarget, stitchChunks } from './stitch.js';
import { captureVisibleTab, focusTab } from './visible.js';

/**
 * Priming scrolls the page, which on infinite-scroll sites loads *new* content
 * and inflates the measured height. Growth beyond MAX_PAGE_GROWTH_RATIO is
 * treated as newly appended content rather than reflow, and clamped away.
 */
function clampPageHeight(measuredHeight, initialHeight) {
  if (!initialHeight || measuredHeight <= initialHeight * MAX_PAGE_GROWTH_RATIO) {
    return measuredHeight;
  }
  console.log(`Capping page height ${measuredHeight} -> ${initialHeight} (infinite scroll detected)`);
  return initialHeight;
}

/** Scroll down the page, screenshotting one viewport at a time. */
async function captureChunks(tabId, windowId, { pageHeight, viewportHeight }) {
  const chunks = [];
  const maxScrollY = Math.max(0, pageHeight - viewportHeight);
  let targetY = 0;
  let previousY = -1;

  while (targetY < pageHeight && chunks.length < MAX_CHUNKS) {
    const actualY = await scrollTo(tabId, Math.min(targetY, maxScrollY));

    // A page that refuses to scroll further (scroll-locked body, inner scroll
    // container, shorter than measured) would otherwise loop forever.
    if (chunks.length > 0 && actualY <= previousY) break;
    previousY = actualY;

    chunks.push({ dataUrl: await captureVisibleTab(windowId), scrollY: actualY });

    if (actualY + viewportHeight >= pageHeight) break;
    targetY = nextScrollTarget(actualY, viewportHeight);
  }

  if (chunks.length >= MAX_CHUNKS) {
    console.warn(`Stopped after ${MAX_CHUNKS} chunks; the capture may be truncated.`);
  }

  return chunks;
}

/**
 * Capture the whole scrollable page as a PNG data URL.
 * @throws if the tab cannot be scripted or captured.
 */
export async function captureFullPage(tab) {
  const tabId = tab.id;

  // captureVisibleTab only sees the window's active tab.
  const windowId = await focusTab(tab);

  const { pageHeight: initialPageHeight } = await measurePageMetrics(tabId);
  await primeLazyContent(tabId);

  const metrics = await measurePageMetrics(tabId);
  const { viewportWidth, viewportHeight, devicePixelRatio: dpr } = metrics;
  const pageHeight = clampPageHeight(metrics.pageHeight, initialPageHeight);

  console.log(`Page: ${viewportWidth}x${pageHeight}px, viewport: ${viewportHeight}px, dpr: ${dpr}`);

  try {
    await hideFixedElements(tabId);
    const chunks = await captureChunks(tabId, windowId, { pageHeight, viewportHeight });
    return await stitchChunks(chunks, { viewportWidth, pageHeight, dpr });
  } finally {
    await restoreHiddenElements(tabId);
  }
}
