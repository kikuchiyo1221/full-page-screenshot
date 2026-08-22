import assert from 'node:assert/strict';
import test from 'node:test';

import { base64ToBytes, bytesToBase64, parseDataUrl } from '../lib/bytes.js';

test('base64 round trips arbitrary bytes', () => {
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('base64 handles buffers larger than the chunk size', () => {
  // 0x8000 is the internal chunk size; go past it to exercise the loop.
  const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, i) => i % 251);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
});

test('parseDataUrl reads mime type and payload', () => {
  const { mimeType, bytes } = parseDataUrl('data:image/png;base64,AAEC');
  assert.equal(mimeType, 'image/png');
  assert.deepEqual(bytes, new Uint8Array([0, 1, 2]));
});

test('parseDataUrl supports non-base64 payloads', () => {
  const { mimeType, bytes } = parseDataUrl('data:text/plain,hello%20world');
  assert.equal(mimeType, 'text/plain');
  assert.equal(new TextDecoder().decode(bytes), 'hello world');
});

test('parseDataUrl rejects anything that is not a data URL', () => {
  assert.throws(() => parseDataUrl('https://example.com/a.png'), /Invalid data URL/);
});
