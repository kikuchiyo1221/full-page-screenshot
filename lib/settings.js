// Single source of truth for user settings and their defaults.

export const DEFAULT_SETTINGS = Object.freeze({
  defaultFormat: 'png',
  jpegQuality: 92,
  defaultSaveDownload: true,
  defaultSaveClipboard: false,
  filePrefix: 'screenshot'
});

export const MIN_JPEG_QUALITY = 1;
export const MAX_JPEG_QUALITY = 100;

/** Read every setting, falling back to DEFAULT_SETTINGS for anything unset. */
export function loadSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

export function saveSettings(settings) {
  return chrome.storage.sync.set(settings);
}

/** Clamp a stored quality value (1-100) into the 0-1 range canvas APIs expect. */
export function normalizeJpegQuality(value) {
  const quality = Number(value) || DEFAULT_SETTINGS.jpegQuality;
  return Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, quality)) / 100;
}
