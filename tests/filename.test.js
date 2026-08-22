import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFilename, extensionForFormat, formatTimestamp } from '../lib/filename.js';

const DATE = new Date('2026-08-22T13:45:01.123Z');

test('timestamps are filesystem safe and sortable', () => {
  assert.equal(formatTimestamp(DATE), '20260822_134501');
});

test('jpeg is written with the conventional .jpg extension', () => {
  assert.equal(extensionForFormat('jpeg'), 'jpg');
  assert.equal(extensionForFormat('png'), 'png');
  assert.equal(extensionForFormat('pdf'), 'pdf');
});

test('unknown formats fall back to png', () => {
  assert.equal(extensionForFormat('webp'), 'png');
});

test('filenames combine prefix, timestamp and extension', () => {
  assert.equal(
    buildFilename({ prefix: 'shot', format: 'jpeg', date: DATE }),
    'shot_20260822_134501.jpg'
  );
});

test('blank prefixes fall back to the default', () => {
  assert.equal(
    buildFilename({ prefix: '   ', format: 'png', date: DATE }),
    'screenshot_20260822_134501.png'
  );
});
