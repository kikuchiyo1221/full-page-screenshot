// Annotation shapes: how each one is created from a drag, and how it is drawn.

const ARROW_HEAD_MIN_PX = 10;
const ARROW_HEAD_STROKE_MULTIPLIER = 3;
const MARKER_ALPHA = 0.4;
const MARKER_STROKE_MULTIPLIER = 3;
const TEXT_MIN_FONT_PX = 16;
const TEXT_FONT_STROKE_MULTIPLIER = 5;
const TEXT_FONT_FAMILY = 'sans-serif';

export const TOOLS = ['arrow', 'rect', 'circle', 'text', 'marker'];

export function markerStrokeWidth(strokeWidth) {
  return strokeWidth * MARKER_STROKE_MULTIPLIER;
}

export function textFontSize(strokeWidth) {
  return Math.max(TEXT_MIN_FONT_PX, strokeWidth * TEXT_FONT_STROKE_MULTIPLIER);
}

/**
 * Build the annotation a completed drag represents.
 * @returns {object|null} null for tools that are not drag-driven (text).
 */
export function createAnnotation(tool, { startX, startY, endX, endY, color, strokeWidth }) {
  const style = { color, strokeWidth };

  switch (tool) {
    case 'arrow':
      return { type: 'arrow', startX, startY, endX, endY, ...style };
    case 'rect':
      return {
        type: 'rect',
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
        ...style
      };
    case 'circle':
      return {
        type: 'circle',
        centerX: (startX + endX) / 2,
        centerY: (startY + endY) / 2,
        radiusX: Math.abs(endX - startX) / 2,
        radiusY: Math.abs(endY - startY) / 2,
        ...style
      };
    default:
      return null;
  }
}

export function createTextAnnotation({ text, x, y, color, strokeWidth }) {
  return { type: 'text', text, x, y, color, fontSize: textFontSize(strokeWidth) };
}

export function createMarkerAnnotation({ x, y, color, strokeWidth }) {
  return {
    type: 'marker',
    points: [{ x, y }],
    color,
    strokeWidth: markerStrokeWidth(strokeWidth)
  };
}

/* ---------------------------------------------------------------- drawing ---- */

function drawArrow(ctx, { startX, startY, endX, endY, strokeWidth }) {
  const headLength = Math.max(ARROW_HEAD_MIN_PX, strokeWidth * ARROW_HEAD_STROKE_MULTIPLIER);
  const angle = Math.atan2(endY - startY, endX - startX);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLength * Math.cos(angle - Math.PI / 6),
    endY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLength * Math.cos(angle + Math.PI / 6),
    endY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawRect(ctx, { x, y, width, height }) {
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.stroke();
}

function drawCircle(ctx, { centerX, centerY, radiusX, radiusY }) {
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMarker(ctx, { points }) {
  if (!points.length) return;

  ctx.save();
  ctx.globalAlpha = MARKER_ALPHA;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, { text, x, y, fontSize }) {
  ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
  ctx.fillText(text, x, y);
}

const RENDERERS = {
  arrow: drawArrow,
  rect: drawRect,
  circle: drawCircle,
  marker: drawMarker,
  text: drawText
};

/** Apply an annotation's stroke/fill style, then draw it. */
export function drawAnnotation(ctx, annotation, fallbackStrokeWidth) {
  const render = RENDERERS[annotation.type];
  if (!render) return;

  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = annotation.strokeWidth ?? fallbackStrokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  render(ctx, annotation);
}

export function drawAnnotations(ctx, annotations, fallbackStrokeWidth) {
  for (const annotation of annotations) {
    drawAnnotation(ctx, annotation, fallbackStrokeWidth);
  }
}
