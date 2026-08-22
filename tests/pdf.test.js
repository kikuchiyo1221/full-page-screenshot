import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPdfFromJpegBytes } from '../lib/pdf.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

function decode(bytes) {
  return new TextDecoder('latin1').decode(bytes);
}

test('the output is a well formed PDF file', () => {
  const pdf = decode(buildPdfFromJpegBytes(JPEG, 800, 600));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.endsWith('%%EOF'));
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\/Type \/Page /);
});

test('the page is sized in points, converted from CSS pixels', () => {
  // 800x600 CSS px at 96dpi -> 600x450 pt at 72dpi.
  assert.match(decode(buildPdfFromJpegBytes(JPEG, 800, 600)), /\/MediaBox \[0 0 600 450\]/);
});

test('a zero-sized image still produces a valid page', () => {
  assert.match(decode(buildPdfFromJpegBytes(JPEG, 0, 0)), /\/MediaBox \[0 0 1 1\]/);
});

test('the image is embedded as DCTDecode data of the declared length', () => {
  const pdf = decode(buildPdfFromJpegBytes(JPEG, 100, 100));
  assert.match(pdf, /\/Filter \/DCTDecode/);
  assert.match(pdf, new RegExp(`/Length ${JPEG.length} >>\\nstream`));
});

test('every xref entry points at the start of its object', () => {
  const bytes = buildPdfFromJpegBytes(JPEG, 100, 100);
  const pdf = decode(bytes);

  const xrefStart = pdf.indexOf('xref\n0 6\n') + 'xref\n0 6\n'.length;
  const entries = pdf.slice(xrefStart).split('\n').slice(0, 6);

  // Entry 0 is the mandatory free entry; 1..5 must land on "<id> 0 obj".
  assert.equal(entries[0], '0000000000 65535 f ');
  for (let id = 1; id <= 5; id += 1) {
    const offset = Number(entries[id].slice(0, 10));
    assert.equal(pdf.slice(offset, offset + `${id} 0 obj`.length), `${id} 0 obj`);
  }
});

test('startxref points at the xref table', () => {
  const pdf = decode(buildPdfFromJpegBytes(JPEG, 100, 100));
  const startxref = Number(/startxref\n(\d+)\n%%EOF$/.exec(pdf)[1]);
  assert.equal(pdf.slice(startxref, startxref + 4), 'xref');
});
