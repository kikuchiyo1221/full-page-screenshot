// Tuning knobs for the capture pipeline. Kept together so the timing trade-offs
// (capture speed vs. giving lazy content a chance to render) are visible at a glance.

/** Wait after each lazy-loading scroll step, in ms. */
export const LAZY_SCROLL_SETTLE_MS = 300;
/** Fraction of the viewport to advance per lazy-loading scroll step. */
export const LAZY_SCROLL_STEP_RATIO = 0.7;
/** Extra wait once the bottom of the page is reached, in ms. */
export const LAZY_BOTTOM_SETTLE_MS = 500;
/** Wait after scrolling back to the original position, in ms. */
export const LAZY_RESTORE_SETTLE_MS = 200;
/** Per-image load timeout during full-page priming, in ms. */
export const IMAGE_LOAD_TIMEOUT_MS = 5000;
/** Per-image load timeout for the lighter visible-area priming, in ms. */
export const QUICK_IMAGE_LOAD_TIMEOUT_MS = 1000;
/** Final wait for web fonts and CSS background images, in ms. */
export const RENDER_SETTLE_MS = 800;
/** Wait after scrolling to a capture position before screenshotting, in ms. */
export const SCROLL_SETTLE_MS = 200;

/**
 * chrome.tabs.captureVisibleTab is quota limited (roughly two calls per second).
 * Space calls out to stay under it, and retry the rejections that slip through.
 */
export const CAPTURE_MIN_INTERVAL_MS = 550;
export const CAPTURE_QUOTA_RETRIES = 3;
/** Let a newly activated tab paint before capturing it, in ms. */
export const TAB_FOCUS_SETTLE_MS = 150;

/**
 * Infinite-scroll guard: pages that grow past this multiple of their pre-priming
 * height are assumed to have loaded *new* content rather than merely reflowed,
 * so the capture is clamped to the original height.
 */
export const MAX_PAGE_GROWTH_RATIO = 1.5;

/** Overlap between adjacent chunks, as a fraction of the viewport and an absolute cap (px). */
export const CHUNK_OVERLAP_RATIO = 0.05;
export const MAX_CHUNK_OVERLAP_PX = 50;

/** Abort the stitch loop after this many chunks; protects against runaway pages. */
export const MAX_CHUNKS = 200;

/** How long the selection overlay may stay open before the capture is abandoned, in ms. */
export const SELECTION_TIMEOUT_MS = 120000;

/** Marker used to tag and hide fixed/sticky elements during capture. */
export const HIDE_STYLE_ID = '__ss-capture-fix';
export const HIDE_ATTRIBUTE = 'data-ss-hide';
