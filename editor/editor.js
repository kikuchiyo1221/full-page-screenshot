// Editor page: draws the captured screenshot, layers annotations on top of it,
// and exports the result as PNG, JPEG or PDF.

import { applyI18n, t } from '../lib/i18n.js';
import { buildFilename } from '../lib/filename.js';
import { jpegBlobToPdfDataUrl } from '../lib/pdf.js';
import { DEFAULT_SETTINGS, normalizeJpegQuality } from '../lib/settings.js';
import {
  createAnnotation,
  createMarkerAnnotation,
  createTextAnnotation,
  drawAnnotation,
  drawAnnotations
} from './annotations.js';
import { History } from './history.js';

const NOTIFICATION_TIMEOUT_MS = 3000;
const BLOB_URL_LIFETIME_MS = 10000;
const DEFAULT_COLOR = '#ff0000';
const DEFAULT_STROKE_WIDTH = 3;

class ScreenshotEditor {
  constructor() {
    this.backgroundCanvas = document.getElementById('background-canvas');
    this.drawingCanvas = document.getElementById('drawing-canvas');
    this.bgCtx = this.backgroundCanvas.getContext('2d');
    this.drawCtx = this.drawingCanvas.getContext('2d');

    this.currentTool = null;
    this.color = DEFAULT_COLOR;
    this.strokeWidth = DEFAULT_STROKE_WIDTH;

    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;
    /** Annotation being drawn right now; rendered on top but not yet committed. */
    this.pending = null;
    this.textPosition = null;

    this.annotations = [];
    this.history = new History();
    this.captureOptions = {};
  }

  async init() {
    applyI18n();
    await this.loadImage();
    this.history.push(this.annotations); // Baseline state so the first undo works.
    this.bindEvents();
    this.updateColorPreview();
  }

  /* ------------------------------------------------------------- loading ---- */

  async loadImage() {
    const { pendingImage, captureOptions } =
      await chrome.storage.local.get(['pendingImage', 'captureOptions']);

    this.captureOptions = captureOptions || {};
    if (this.captureOptions.format) {
      document.getElementById('format-select').value = this.captureOptions.format;
    }

    if (!pendingImage) {
      console.error('No image data found');
      this.showNotification('No screenshot to edit', 'error');
      return;
    }

    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode screenshot'));
      element.src = pendingImage;
    });

    for (const canvas of [this.backgroundCanvas, this.drawingCanvas]) {
      canvas.width = image.width;
      canvas.height = image.height;
    }

    const container = document.getElementById('canvas-container');
    container.style.width = `${image.width}px`;
    container.style.height = `${image.height}px`;

    this.bgCtx.drawImage(image, 0, 0);
  }

  /* -------------------------------------------------------------- events ---- */

  bindEvents() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach((button) => {
      button.addEventListener('click', () => this.selectTool(button.dataset.tool));
    });

    document.getElementById('color-picker').addEventListener('input', (event) => {
      this.color = event.target.value;
      this.updateColorPreview();
    });

    document.getElementById('stroke-width').addEventListener('input', (event) => {
      this.strokeWidth = parseInt(event.target.value, 10);
      document.getElementById('stroke-value').textContent = `${this.strokeWidth}px`;
    });

    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-clear').addEventListener('click', () => this.clearAll());

    document.getElementById('btn-save').addEventListener('click', () => this.save());
    document.getElementById('btn-copy').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('btn-cancel').addEventListener('click', () => this.cancel());

    this.drawingCanvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
    this.drawingCanvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
    this.drawingCanvas.addEventListener('mouseup', (event) => this.onMouseUp(event));
    this.drawingCanvas.addEventListener('mouseleave', (event) => this.onMouseUp(event));

    document.getElementById('text-cancel').addEventListener('click', () => this.closeTextModal());
    document.getElementById('text-confirm').addEventListener('click', () => this.addText());

    document.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  onKeyDown(event) {
    if (event.key === 'Escape') {
      this.closeTextModal();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;

    const actions = { z: () => this.undo(), y: () => this.redo(), s: () => this.save() };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  selectTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === tool);
    });
    this.drawingCanvas.style.cursor = 'crosshair';
  }

  updateColorPreview() {
    document.getElementById('color-preview').style.background = this.color;
  }

  /** Translate a mouse event into canvas pixel coordinates. */
  getCanvasCoordinates(event) {
    const rect = this.drawingCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.drawingCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.drawingCanvas.height / rect.height)
    };
  }

  /* ------------------------------------------------------------- drawing ---- */

  onMouseDown(event) {
    if (!this.currentTool) return;

    const { x, y } = this.getCanvasCoordinates(event);
    this.startX = x;
    this.startY = y;

    if (this.currentTool === 'text') {
      this.openTextModal(x, y);
      return;
    }

    this.isDrawing = true;
    this.pending = this.currentTool === 'marker'
      ? createMarkerAnnotation({ x, y, color: this.color, strokeWidth: this.strokeWidth })
      : null;
  }

  onMouseMove(event) {
    if (!this.isDrawing) return;

    const { x, y } = this.getCanvasCoordinates(event);

    if (this.currentTool === 'marker') {
      this.pending.points.push({ x, y });
    } else {
      this.pending = createAnnotation(this.currentTool, {
        startX: this.startX,
        startY: this.startY,
        endX: x,
        endY: y,
        color: this.color,
        strokeWidth: this.strokeWidth
      });
    }

    this.redraw();
  }

  onMouseUp(event) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const { x, y } = this.getCanvasCoordinates(event);
    const annotation = this.currentTool === 'marker'
      ? this.pending
      : createAnnotation(this.currentTool, {
        startX: this.startX,
        startY: this.startY,
        endX: x,
        endY: y,
        color: this.color,
        strokeWidth: this.strokeWidth
      });

    this.pending = null;
    if (annotation) {
      this.commit(annotation);
    } else {
      this.redraw();
    }
  }

  commit(annotation) {
    this.annotations.push(annotation);
    this.history.push(this.annotations);
    this.redraw();
  }

  redraw() {
    this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    drawAnnotations(this.drawCtx, this.annotations, this.strokeWidth);
    if (this.pending) {
      drawAnnotation(this.drawCtx, this.pending, this.strokeWidth);
    }
  }

  undo() {
    this.applySnapshot(this.history.undo());
  }

  redo() {
    this.applySnapshot(this.history.redo());
  }

  applySnapshot(snapshot) {
    if (!snapshot) return;
    this.annotations = snapshot;
    this.redraw();
  }

  clearAll() {
    this.annotations = [];
    this.history.push(this.annotations);
    this.redraw();
  }

  /* ---------------------------------------------------------------- text ---- */

  openTextModal(x, y) {
    this.textPosition = { x, y };
    document.getElementById('text-modal').classList.remove('hidden');

    const input = document.getElementById('text-input');
    input.value = '';
    input.focus();
  }

  closeTextModal() {
    document.getElementById('text-modal').classList.add('hidden');
    this.textPosition = null;
  }

  addText() {
    const text = document.getElementById('text-input').value.trim();
    if (text && this.textPosition) {
      this.commit(createTextAnnotation({
        text,
        x: this.textPosition.x,
        y: this.textPosition.y,
        color: this.color,
        strokeWidth: this.strokeWidth
      }));
    }
    this.closeTextModal();
  }

  /* -------------------------------------------------------------- export ---- */

  /** Flatten the screenshot and its annotations onto one canvas. */
  createFinalCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = this.backgroundCanvas.width;
    canvas.height = this.backgroundCanvas.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.backgroundCanvas, 0, 0);
    ctx.drawImage(this.drawingCanvas, 0, 0);
    return canvas;
  }

  async exportImage(format, quality) {
    const canvas = this.createFinalCanvas();

    if (format !== 'pdf') {
      return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
    }

    const jpegBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to create PDF image blob'))),
        'image/jpeg',
        quality
      );
    });
    return jpegBlobToPdfDataUrl(jpegBlob, canvas.width, canvas.height);
  }

  async save() {
    const format = document.getElementById('format-select').value;
    const { filePrefix, jpegQuality } = await chrome.storage.sync.get({
      filePrefix: DEFAULT_SETTINGS.filePrefix,
      jpegQuality: DEFAULT_SETTINGS.jpegQuality
    });

    const dataUrl = await this.exportImage(format, normalizeJpegQuality(jpegQuality));

    // Chrome blocks downloads from data URLs, so hand it a blob URL instead.
    const blob = await (await fetch(dataUrl)).blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename: buildFilename({ prefix: filePrefix, format }),
        saveAs: false
      });
      this.showNotification(t('msgDownloaded') || 'Downloaded');
    } catch (error) {
      console.error('Download failed:', error);
      this.showNotification('Download failed', 'error');
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_LIFETIME_MS);
    }
  }

  async copyToClipboard() {
    if (document.getElementById('format-select').value === 'pdf') {
      this.showNotification('PDF cannot be copied to clipboard', 'error');
      return;
    }

    try {
      const blob = await (await fetch(await this.exportImage('png'))).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.showNotification(t('msgCopied') || 'Copied to clipboard');
    } catch (error) {
      console.error('Copy failed:', error);
      this.showNotification('Copy failed', 'error');
    }
  }

  cancel() {
    chrome.storage.local.remove(['pendingImage', 'captureOptions']);
    window.close();
  }

  showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `editor-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), NOTIFICATION_TIMEOUT_MS);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotEditor().init().catch((error) => console.error('Editor init failed:', error));
});
