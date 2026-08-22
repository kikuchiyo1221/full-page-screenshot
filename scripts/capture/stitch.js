// Assembling viewport-sized screenshots into one full-page image.
//
// planStitchLayout() is pure so the geometry — the part that used to produce
// gray seams between chunks — can be unit tested without a canvas.

import { CHUNK_OVERLAP_RATIO, MAX_CHUNK_OVERLAP_PX } from './constants.js';
import { bytesToBase64, dataUrlToBlob } from '../../lib/bytes.js';

/**
 * Where to scroll for the chunk after one that landed at `actualY`.
 * Adjacent chunks overlap slightly so sub-pixel rounding cannot leave a gap.
 */
export function nextScrollTarget(actualY, viewportHeight) {
  const overlap = Math.min(MAX_CHUNK_OVERLAP_PX, Math.floor(viewportHeight * CHUNK_OVERLAP_RATIO));
  return actualY + viewportHeight - overlap;
}

/**
 * Decide where each captured chunk is drawn on the output canvas.
 *
 * Chunks are placed at their real scroll offset, then pulled flush against the
 * previous chunk: the overlap is cropped off the *source* instead of being drawn
 * twice, and destinations are chained so rounding can never open a seam.
 *
 * @param {{scrollY: number, heightPx: number}[]} chunks in capture order
 * @param {{dpr: number, totalHeightPx: number}} output canvas geometry
 * @returns {{index: number, srcY: number, destY: number, height: number}[]}
 */
export function planStitchLayout(chunks, { dpr, totalHeightPx }) {
  const operations = [];
  let previousDrawEndY = 0;
  let isFirstDrawn = true;

  chunks.forEach((chunk, index) => {
    let destY = Math.round(chunk.scrollY * dpr);
    let srcY = 0;

    if (!isFirstDrawn) {
      if (destY < previousDrawEndY) srcY = previousDrawEndY - destY;
      destY = previousDrawEndY;
    }

    const height = Math.min(chunk.heightPx - srcY, totalHeightPx - destY);
    if (height <= 0) return;

    operations.push({ index, srcY, destY, height });
    previousDrawEndY = destY + height;
    isFirstDrawn = false;
  });

  return operations;
}

/**
 * Decode the captured PNG chunks and composite them into one PNG data URL.
 * @param {{dataUrl: string, scrollY: number}[]} chunks PNG data URLs in capture order
 */
export async function stitchChunks(chunks, { viewportWidth, pageHeight, dpr }) {
  const bitmaps = await Promise.all(
    chunks.map((chunk) => createImageBitmap(dataUrlToBlob(chunk.dataUrl)))
  );

  try {
    const totalWidthPx = Math.max(1, Math.ceil(viewportWidth * dpr));
    const totalHeightPx = Math.max(1, Math.ceil(pageHeight * dpr));

    const canvas = new OffscreenCanvas(totalWidthPx, totalHeightPx);
    const context = canvas.getContext('2d');

    const layout = planStitchLayout(
      chunks.map((chunk, index) => ({ scrollY: chunk.scrollY, heightPx: bitmaps[index].height })),
      { dpr, totalHeightPx }
    );

    for (const { index, srcY, destY, height } of layout) {
      const bitmap = bitmaps[index];
      context.drawImage(
        bitmap,
        0, srcY, bitmap.width, height,
        0, destY, bitmap.width, height
      );
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
