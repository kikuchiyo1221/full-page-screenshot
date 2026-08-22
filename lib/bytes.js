// Binary <-> text helpers shared by the service worker and extension pages.

const BASE64_CHUNK_SIZE = 0x8000;

/** Encode bytes as base64 without blowing the argument limit on large buffers. */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Parse a data URL into its MIME type and raw bytes. */
export function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid data URL');
  }
  const [, mimeType, isBase64, payload] = match;
  const bytes = isBase64
    ? base64ToBytes(payload)
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { mimeType: mimeType || 'application/octet-stream', bytes };
}

export function dataUrlToBlob(dataUrl) {
  const { mimeType, bytes } = parseDataUrl(dataUrl);
  return new Blob([bytes], { type: mimeType });
}

export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}
