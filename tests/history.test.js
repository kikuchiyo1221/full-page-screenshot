import assert from 'node:assert/strict';
import test from 'node:test';

import { History } from '../editor/history.js';

test('undo and redo walk the recorded snapshots', () => {
  const history = new History();
  history.push([]);
  history.push(['a']);
  history.push(['a', 'b']);

  assert.deepEqual(history.undo(), ['a']);
  assert.deepEqual(history.undo(), []);
  assert.equal(history.undo(), null, 'cannot undo past the initial state');
  assert.deepEqual(history.redo(), ['a']);
});

test('snapshots are copies, not references', () => {
  const history = new History();
  const annotations = [];
  history.push(annotations);
  annotations.push('mutated after push');
  history.push(annotations);

  assert.deepEqual(history.undo(), []);
});

test('pushing after an undo discards the redo branch', () => {
  const history = new History();
  history.push([]);
  history.push(['a']);
  history.undo();
  history.push(['b']);

  assert.equal(history.canRedo, false);
  assert.deepEqual(history.undo(), []);
});

test('the oldest snapshot is dropped once the limit is reached', () => {
  const history = new History(3);
  history.push([1]);
  history.push([2]);
  history.push([3]);
  history.push([4]);

  assert.deepEqual(history.undo(), [3]);
  assert.deepEqual(history.undo(), [2]);
  assert.equal(history.undo(), null);
});
