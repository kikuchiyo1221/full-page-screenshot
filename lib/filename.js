// Output filename construction, shared by the editor and the options preview.

const EXTENSIONS = { jpeg: 'jpg', png: 'png', pdf: 'pdf' };

export function extensionForFormat(format) {
  return EXTENSIONS[format] || 'png';
}

/** `20260822_134501` — filesystem-safe, sorts chronologically. */
export function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
}

export function buildFilename({ prefix = 'screenshot', format = 'png', date = new Date() } = {}) {
  const safePrefix = String(prefix).trim() || 'screenshot';
  return `${safePrefix}_${formatTimestamp(date)}.${extensionForFormat(format)}`;
}
