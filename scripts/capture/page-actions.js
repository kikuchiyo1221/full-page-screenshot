// Everything the capture pipeline does *inside* the target tab.
//
// All of it goes through chrome.scripting, which the extension already needs for
// the selection overlay — no "debugger" permission involved.
//
// A `func` passed to chrome.scripting.executeScript is serialized and re-parsed
// in the page, so an injected function must be fully self-contained: it cannot
// reference module-scope helpers. Hence the nested helpers below, and the single
// `preparePageInPage` entry point that both priming modes share.

import {
  HIDE_ATTRIBUTE,
  HIDE_STYLE_ID,
  IMAGE_LOAD_TIMEOUT_MS,
  LAZY_BOTTOM_SETTLE_MS,
  LAZY_RESTORE_SETTLE_MS,
  LAZY_SCROLL_SETTLE_MS,
  LAZY_SCROLL_STEP_RATIO,
  QUICK_IMAGE_LOAD_TIMEOUT_MS,
  RENDER_SETTLE_MS,
  SCROLL_SETTLE_MS
} from './constants.js';

async function runInPage(tabId, func, args = []) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return injection?.result;
}

/* ---------------------------------------------------------------- in-page ---- */

function measureMetricsInPage() {
  return {
    pageHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

/**
 * @param {'fullPage'|'visible'} mode  'fullPage' scrolls the page to trigger lazy
 *   loading; 'visible' only forces eager loading, leaving dropdowns and hover
 *   menus untouched.
 */
async function preparePageInPage(mode, timing) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const forceEagerLoading = () => {
    document.querySelectorAll('img').forEach((img) => {
      // Common lazy-loading attribute conventions (lazysizes and friends).
      if (img.dataset.src && !img.src) img.src = img.dataset.src;
      if (img.dataset.srcset && !img.srcset) img.srcset = img.dataset.srcset;
      if (img.loading === 'lazy') img.loading = 'eager';
    });

    document.querySelectorAll('picture source').forEach((source) => {
      if (source.dataset.srcset && !source.srcset) source.srcset = source.dataset.srcset;
    });

    document.querySelectorAll('[data-background], [data-bg]').forEach((element) => {
      const url = element.dataset.background || element.dataset.bg;
      if (url) element.style.backgroundImage = `url(${url})`;
    });
  };

  const waitForImages = (timeoutMs) => Promise.all(
    Array.from(document.querySelectorAll('img')).map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, timeoutMs);
      });
    })
  );

  forceEagerLoading();

  if (mode === 'fullPage') {
    const originalScrollY = window.scrollY;
    const totalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

    // A single pass only: repeated passes re-trigger infinite scroll and duplicate content.
    const scrollStep = Math.max(1, Math.floor(window.innerHeight * timing.scrollStepRatio));
    for (let y = 0; y < totalHeight; y += scrollStep) {
      window.scrollTo(0, y);
      await sleep(timing.scrollSettleMs);
    }

    window.scrollTo(0, totalHeight);
    await sleep(timing.bottomSettleMs);

    window.scrollTo(0, originalScrollY);
    await sleep(timing.restoreSettleMs);
  }

  await waitForImages(timing.imageTimeoutMs);
  await sleep(timing.renderSettleMs); // Web fonts and CSS background images.
}

function scrollToInPage(targetY, settleMs) {
  return new Promise((resolve) => {
    window.scrollTo(0, targetY);
    requestAnimationFrame(() => setTimeout(() => resolve(window.scrollY), settleMs));
  });
}

function hideFixedElementsInPage(styleId, hideAttribute) {
  document.getElementById(styleId)?.remove();
  document.querySelectorAll(`[${hideAttribute}]`).forEach((element) => {
    element.removeAttribute(hideAttribute);
  });

  document.querySelectorAll('*').forEach((element) => {
    const position = getComputedStyle(element).position;
    if (position === 'fixed' || position === 'sticky') {
      element.setAttribute(hideAttribute, '1');
    }
  });

  const sheet = document.createElement('style');
  sheet.id = styleId;
  sheet.textContent = `[${hideAttribute}] { display: none !important; }`;
  document.head.appendChild(sheet);
}

function restoreHiddenElementsInPage(styleId, hideAttribute) {
  document.getElementById(styleId)?.remove();
  document.querySelectorAll(`[${hideAttribute}]`).forEach((element) => {
    element.removeAttribute(hideAttribute);
  });
}

/* ----------------------------------------------------------------- driver ---- */

/** Page height, viewport size and DPR, in one round trip. */
export function measurePageMetrics(tabId) {
  return runInPage(tabId, measureMetricsInPage);
}

/** Scroll the whole page once so lazy images and IntersectionObservers fire. */
export function primeLazyContent(tabId) {
  return runInPage(tabId, preparePageInPage, ['fullPage', {
    scrollStepRatio: LAZY_SCROLL_STEP_RATIO,
    scrollSettleMs: LAZY_SCROLL_SETTLE_MS,
    bottomSettleMs: LAZY_BOTTOM_SETTLE_MS,
    restoreSettleMs: LAZY_RESTORE_SETTLE_MS,
    imageTimeoutMs: IMAGE_LOAD_TIMEOUT_MS,
    renderSettleMs: RENDER_SETTLE_MS
  }]);
}

/**
 * Lighter priming for visible-area captures: never scrolls, so open dropdowns
 * and hover menus survive until the screenshot is taken.
 */
export function primeVisibleContent(tabId) {
  return runInPage(tabId, preparePageInPage, ['visible', {
    imageTimeoutMs: QUICK_IMAGE_LOAD_TIMEOUT_MS,
    renderSettleMs: SCROLL_SETTLE_MS
  }]);
}

/** Scroll to `targetY` and report where the page actually landed. */
export function scrollTo(tabId, targetY) {
  return runInPage(tabId, scrollToInPage, [Math.max(0, Math.round(targetY)), SCROLL_SETTLE_MS]);
}

/** Hide fixed/sticky elements so headers don't reappear in every chunk. */
export function hideFixedElements(tabId) {
  return runInPage(tabId, hideFixedElementsInPage, [HIDE_STYLE_ID, HIDE_ATTRIBUTE]);
}

export function restoreHiddenElements(tabId) {
  return runInPage(tabId, restoreHiddenElementsInPage, [HIDE_STYLE_ID, HIDE_ATTRIBUTE])
    .catch((error) => console.warn('Failed to restore hidden capture elements:', error));
}
