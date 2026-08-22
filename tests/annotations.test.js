import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAnnotation,
  createMarkerAnnotation,
  createTextAnnotation,
  markerStrokeWidth,
  textFontSize
} from '../editor/annotations.js';

const STYLE = { color: '#ff0000', strokeWidth: 4 };

test('rectangles are normalized whichever way the user drags', () => {
  const dragged = { startX: 100, startY: 80, endX: 20, endY: 10, ...STYLE };
  assert.deepEqual(createAnnotation('rect', dragged), {
    type: 'rect', x: 20, y: 10, width: 80, height: 70, ...STYLE
  });
});

test('circles are stored as a center plus radii', () => {
  const dragged = { startX: 0, startY: 0, endX: 100, endY: 50, ...STYLE };
  assert.deepEqual(createAnnotation('circle', dragged), {
    type: 'circle', centerX: 50, centerY: 25, radiusX: 50, radiusY: 25, ...STYLE
  });
});

test('arrows keep their direction', () => {
  const dragged = { startX: 10, startY: 10, endX: 0, endY: 0, ...STYLE };
  assert.deepEqual(createAnnotation('arrow', dragged), {
    type: 'arrow', startX: 10, startY: 10, endX: 0, endY: 0, ...STYLE
  });
});

test('tools without a drag shape produce no annotation', () => {
  assert.equal(createAnnotation('text', { ...STYLE }), null);
  assert.equal(createAnnotation('marker', { ...STYLE }), null);
});

test('markers are drawn thicker than the selected stroke width', () => {
  const marker = createMarkerAnnotation({ x: 1, y: 2, ...STYLE });
  assert.deepEqual(marker.points, [{ x: 1, y: 2 }]);
  assert.equal(marker.strokeWidth, markerStrokeWidth(STYLE.strokeWidth));
});

test('text is never smaller than the legible minimum', () => {
  assert.equal(textFontSize(1), 16);
  assert.equal(textFontSize(10), 50);
  assert.equal(createTextAnnotation({ text: 'hi', x: 0, y: 0, ...STYLE }).fontSize, 20);
});
