import assert from 'node:assert/strict';
import test from 'node:test';

import { nextScrollTarget, planStitchLayout } from '../scripts/capture/stitch.js';

test('consecutive chunks overlap so rounding cannot open a seam', () => {
  // 5% of 800 = 40, below the 50px cap.
  assert.equal(nextScrollTarget(0, 800), 760);
  // 5% of 2000 = 100, capped at 50.
  assert.equal(nextScrollTarget(1000, 2000), 2950);
});

test('chunks are laid out contiguously, cropping the overlap from the source', () => {
  const layout = planStitchLayout(
    [
      { scrollY: 0, heightPx: 800 },
      { scrollY: 760, heightPx: 800 },
      { scrollY: 1520, heightPx: 800 }
    ],
    { dpr: 1, totalHeightPx: 2320 }
  );

  assert.deepEqual(layout, [
    { index: 0, srcY: 0, destY: 0, height: 800 },
    { index: 1, srcY: 40, destY: 800, height: 760 },
    { index: 2, srcY: 40, destY: 1560, height: 760 }
  ]);

  // No gaps and no double-drawn rows: each chunk starts exactly where the last ended.
  let expectedY = 0;
  for (const op of layout) {
    assert.equal(op.destY, expectedY);
    expectedY += op.height;
  }
  assert.equal(expectedY, 2320);
});

test('scroll offsets are scaled by the device pixel ratio', () => {
  const layout = planStitchLayout(
    [{ scrollY: 0, heightPx: 1600 }, { scrollY: 760, heightPx: 1600 }],
    { dpr: 2, totalHeightPx: 3120 }
  );

  assert.equal(layout[1].destY, 1600);
  assert.equal(layout[1].srcY, 1600 - 760 * 2);
});

test('the final chunk is clipped to the canvas instead of overflowing', () => {
  const layout = planStitchLayout(
    [{ scrollY: 0, heightPx: 800 }, { scrollY: 760, heightPx: 800 }],
    { dpr: 1, totalHeightPx: 1000 }
  );

  assert.equal(layout[1].destY + layout[1].height, 1000);
});

test('chunks that fall entirely outside the canvas are dropped', () => {
  const layout = planStitchLayout(
    [{ scrollY: 0, heightPx: 800 }, { scrollY: 800, heightPx: 800 }],
    { dpr: 1, totalHeightPx: 800 }
  );

  assert.equal(layout.length, 1);
});

test('an empty capture produces no draw operations', () => {
  assert.deepEqual(planStitchLayout([], { dpr: 1, totalHeightPx: 100 }), []);
});
