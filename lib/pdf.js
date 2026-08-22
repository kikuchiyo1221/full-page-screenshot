// Minimal single-page PDF writer that embeds one JPEG image.
// Shared by the service worker and the editor page (previously duplicated in both).

import { bytesToBase64 } from './bytes.js';

const CSS_PX_PER_INCH = 96;
const PDF_POINTS_PER_INCH = 72;
const OBJECT_COUNT = 5;

/** Convert CSS pixels to PDF points, never returning a degenerate page size. */
function pxToPt(px) {
  return Math.max(1, Math.round((px * PDF_POINTS_PER_INCH) / CSS_PX_PER_INCH));
}

/**
 * Build a one-page PDF wrapping `jpegBytes` at its natural size.
 * @returns {Uint8Array} the complete PDF file
 */
export function buildPdfFromJpegBytes(jpegBytes, widthPx, heightPx) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let totalLength = 0;

  const pushBytes = (bytes) => {
    parts.push(bytes);
    totalLength += bytes.length;
  };
  const pushText = (text) => pushBytes(encoder.encode(text));

  const startObject = (id) => {
    offsets[id] = totalLength;
    pushText(`${id} 0 obj\n`);
  };
  const endObject = () => pushText('\nendobj\n');

  const widthPt = pxToPt(widthPx);
  const heightPt = pxToPt(heightPx);
  const contentBytes = encoder.encode(`q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`);

  pushText('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  startObject(1);
  pushText('<< /Type /Catalog /Pages 2 0 R >>');
  endObject();

  startObject(2);
  pushText('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObject();

  startObject(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] ` +
    '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'
  );
  endObject();

  startObject(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
    '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ' +
    `/Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushText('\nendstream');
  endObject();

  startObject(5);
  pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText('endstream');
  endObject();

  const xrefOffset = totalLength;
  pushText(`xref\n0 ${OBJECT_COUNT + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let id = 1; id <= OBJECT_COUNT; id += 1) {
    pushText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${OBJECT_COUNT + 1} /Root 1 0 R >>\n`);
  pushText(`startxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(totalLength);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

export async function jpegBlobToPdfDataUrl(jpegBlob, widthPx, heightPx) {
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = buildPdfFromJpegBytes(jpegBytes, widthPx, heightPx);
  return `data:application/pdf;base64,${bytesToBase64(pdfBytes)}`;
}
