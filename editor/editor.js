// Screenshot Editor

class ScreenshotEditor {
  constructor() {
    this.backgroundCanvas = document.getElementById('background-canvas');
    this.drawingCanvas = document.getElementById('drawing-canvas');
    this.bgCtx = this.backgroundCanvas.getContext('2d');
    this.drawCtx = this.drawingCanvas.getContext('2d');

    this.currentTool = null;
    this.color = '#ff0000';
    this.strokeWidth = 3;
    this.isDrawing = false;
    this.startX = 0;
    this.startY = 0;

    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    this.annotations = [];
    this.currentAnnotation = null;

    this.imageData = null;
    this.captureOptions = null;

    this.init();
  }

  async init() {
    await this.loadImage();
    this.initI18n();
    this.bindEvents();
    this.updateColorPreview();
  }

  initI18n() {
    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const key = elem.getAttribute('data-i18n');
      const message = chrome.i18n.getMessage(key);
      if (message) {
        elem.textContent = message;
      }
    });
  }

  async loadImage() {
    const data = await chrome.storage.local.get(['pendingImage', 'captureOptions']);
    this.imageData = data.pendingImage;
    this.captureOptions = data.captureOptions || {};

    if (!this.imageData) {
      console.error('No image data found');
      return;
    }

    // Set format selector
    const formatSelect = document.getElementById('format-select');
    if (this.captureOptions.format) {
      formatSelect.value = this.captureOptions.format;
    }

    // Load image
    const img = new Image();
    img.onload = () => {
      const container = document.getElementById('canvas-container');

      // Set canvas size
      this.backgroundCanvas.width = img.width;
      this.backgroundCanvas.height = img.height;
      this.drawingCanvas.width = img.width;
      this.drawingCanvas.height = img.height;

      // Set container size
      container.style.width = img.width + 'px';
      container.style.height = img.height + 'px';

      // Draw image
      this.bgCtx.drawImage(img, 0, 0);

      // Save initial state
      this.saveHistory();
    };
    img.src = this.imageData;
  }

  bindEvents() {
    // Tool selection
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectTool(btn.dataset.tool);
      });
    });

    // Color picker
    const colorPicker = document.getElementById('color-picker');
    colorPicker.addEventListener('input', (e) => {
      this.color = e.target.value;
      this.updateColorPreview();
    });

    // Stroke width
    const strokeSlider = document.getElementById('stroke-width');
    strokeSlider.addEventListener('input', (e) => {
      this.strokeWidth = parseInt(e.target.value);
      document.getElementById('stroke-value').textContent = this.strokeWidth + 'px';
    });

    // Undo/Redo
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-clear').addEventListener('click', () => this.clearAll());

    // Save/Copy/Cancel
    document.getElementById('btn-save').addEventListener('click', () => this.save());
    document.getElementById('btn-copy').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('btn-cancel').addEventListener('click', () => this.cancel());

    // Canvas events
    this.drawingCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.drawingCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.drawingCanvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.drawingCanvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));

    // Text modal
    document.getElementById('text-cancel').addEventListener('click', () => this.closeTextModal());
    document.getElementById('text-confirm').addEventListener('click', () => this.addText());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          this.undo();
        } else if (e.key === 'y') {
          e.preventDefault();
          this.redo();
        } else if (e.key === 's') {
          e.preventDefault();
          this.save();
        }
      }
      if (e.key === 'Escape') {
        this.closeTextModal();
      }
    });
  }

  selectTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Update cursor
    if (tool === 'marker') {
      this.drawingCanvas.style.cursor = 'crosshair';
    } else {
      this.drawingCanvas.style.cursor = 'crosshair';
    }
  }

  updateColorPreview() {
    document.getElementById('color-preview').style.background = this.color;
  }

  getCanvasCoordinates(e) {
    const rect = this.drawingCanvas.getBoundingClientRect();
    const scaleX = this.drawingCanvas.width / rect.width;
    const scaleY = this.drawingCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  onMouseDown(e) {
    if (!this.currentTool) return;

    const coords = this.getCanvasCoordinates(e);
    this.isDrawing = true;
    this.startX = coords.x;
    this.startY = coords.y;

    if (this.currentTool === 'text') {
      this.openTextModal(coords.x, coords.y);
      this.isDrawing = false;
      return;
    }

    if (this.currentTool === 'marker') {
      this.currentAnnotation = {
        type: 'marker',
        points: [{ x: coords.x, y: coords.y }],
        color: this.color,
        width: this.strokeWidth * 3
      };
    }
  }

  onMouseMove(e) {
    if (!this.isDrawing || !this.currentTool) return;

    const coords = this.getCanvasCoordinates(e);

    // Clear drawing canvas
    this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);

    // Redraw existing annotations
    this.redrawAnnotations();

    // Draw current shape preview
    this.drawCtx.strokeStyle = this.color;
    this.drawCtx.fillStyle = this.color;
    this.drawCtx.lineWidth = this.strokeWidth;
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    switch (this.currentTool) {
      case 'arrow':
        this.drawArrow(this.startX, this.startY, coords.x, coords.y);
        break;
      case 'rect':
        this.drawRect(this.startX, this.startY, coords.x, coords.y);
        break;
      case 'circle':
        this.drawCircle(this.startX, this.startY, coords.x, coords.y);
        break;
      case 'marker':
        this.currentAnnotation.points.push({ x: coords.x, y: coords.y });
        this.drawMarker(this.currentAnnotation);
        break;
    }
  }

  onMouseUp(e) {
    if (!this.isDrawing || !this.currentTool) return;

    const coords = this.getCanvasCoordinates(e);
    this.isDrawing = false;

    // Create annotation
    let annotation = null;

    switch (this.currentTool) {
      case 'arrow':
        annotation = {
          type: 'arrow',
          startX: this.startX,
          startY: this.startY,
          endX: coords.x,
          endY: coords.y,
          color: this.color,
          width: this.strokeWidth
        };
        break;
      case 'rect':
        annotation = {
          type: 'rect',
          x: Math.min(this.startX, coords.x),
          y: Math.min(this.startY, coords.y),
          width: Math.abs(coords.x - this.startX),
          height: Math.abs(coords.y - this.startY),
          color: this.color,
          strokeWidth: this.strokeWidth
        };
        break;
      case 'circle':
        const centerX = (this.startX + coords.x) / 2;
        const centerY = (this.startY + coords.y) / 2;
        const radiusX = Math.abs(coords.x - this.startX) / 2;
        const radiusY = Math.abs(coords.y - this.startY) / 2;
        annotation = {
          type: 'circle',
          centerX,
          centerY,
          radiusX,
          radiusY,
          color: this.color,
          strokeWidth: this.strokeWidth
        };
        break;
      case 'marker':
        annotation = this.currentAnnotation;
        this.currentAnnotation = null;
        break;
    }

    if (annotation) {
      this.annotations.push(annotation);
      this.saveHistory();
    }
  }

  drawArrow(x1, y1, x2, y2) {
    const headLength = Math.max(10, this.strokeWidth * 3);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    this.drawCtx.beginPath();
    this.drawCtx.moveTo(x1, y1);
    this.drawCtx.lineTo(x2, y2);
    this.drawCtx.stroke();

    // Arrow head
    this.drawCtx.beginPath();
    this.drawCtx.moveTo(x2, y2);
    this.drawCtx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.drawCtx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.drawCtx.closePath();
    this.drawCtx.fill();
  }

  drawRect(x1, y1, x2, y2) {
    this.drawCtx.beginPath();
    this.drawCtx.rect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(x2 - x1),
      Math.abs(y2 - y1)
    );
    this.drawCtx.stroke();
  }

  drawCircle(x1, y1, x2, y2) {
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;

    this.drawCtx.beginPath();
    this.drawCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.drawCtx.stroke();
  }

  drawMarker(annotation) {
    this.drawCtx.save();
    this.drawCtx.globalAlpha = 0.4;
    this.drawCtx.strokeStyle = annotation.color;
    this.drawCtx.lineWidth = annotation.width;
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';

    this.drawCtx.beginPath();
    const points = annotation.points;
    if (points.length > 0) {
      this.drawCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.drawCtx.lineTo(points[i].x, points[i].y);
      }
    }
    this.drawCtx.stroke();
    this.drawCtx.restore();
  }

  drawText(annotation) {
    this.drawCtx.font = `${annotation.fontSize}px sans-serif`;
    this.drawCtx.fillStyle = annotation.color;
    this.drawCtx.fillText(annotation.text, annotation.x, annotation.y);
  }

  redrawAnnotations() {
    for (const annotation of this.annotations) {
      this.drawCtx.strokeStyle = annotation.color;
      this.drawCtx.fillStyle = annotation.color;
      this.drawCtx.lineWidth = annotation.strokeWidth || annotation.width || this.strokeWidth;
      this.drawCtx.lineCap = 'round';
      this.drawCtx.lineJoin = 'round';

      switch (annotation.type) {
        case 'arrow':
          this.drawArrow(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
          break;
        case 'rect':
          this.drawCtx.lineWidth = annotation.strokeWidth;
          this.drawCtx.beginPath();
          this.drawCtx.rect(annotation.x, annotation.y, annotation.width, annotation.height);
          this.drawCtx.stroke();
          break;
        case 'circle':
          this.drawCtx.lineWidth = annotation.strokeWidth;
          this.drawCtx.beginPath();
          this.drawCtx.ellipse(
            annotation.centerX,
            annotation.centerY,
            annotation.radiusX,
            annotation.radiusY,
            0, 0, Math.PI * 2
          );
          this.drawCtx.stroke();
          break;
        case 'marker':
          this.drawMarker(annotation);
          break;
        case 'text':
          this.drawText(annotation);
          break;
      }
    }
  }

  openTextModal(x, y) {
    this.textPosition = { x, y };
    document.getElementById('text-modal').classList.remove('hidden');
    document.getElementById('text-input').value = '';
    document.getElementById('text-input').focus();
  }

  closeTextModal() {
    document.getElementById('text-modal').classList.add('hidden');
    this.textPosition = null;
  }

  addText() {
    const text = document.getElementById('text-input').value.trim();
    if (!text || !this.textPosition) {
      this.closeTextModal();
      return;
    }

    const annotation = {
      type: 'text',
      text,
      x: this.textPosition.x,
      y: this.textPosition.y,
      color: this.color,
      fontSize: Math.max(16, this.strokeWidth * 5)
    };

    this.annotations.push(annotation);
    this.saveHistory();

    this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    this.redrawAnnotations();

    this.closeTextModal();
  }

  saveHistory() {
    // Remove future history if we're not at the end
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Save current state
    this.history.push(JSON.stringify(this.annotations));
    this.historyIndex++;

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.annotations = JSON.parse(this.history[this.historyIndex]);
      this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
      this.redrawAnnotations();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.annotations = JSON.parse(this.history[this.historyIndex]);
      this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
      this.redrawAnnotations();
    }
  }

  clearAll() {
    this.annotations = [];
    this.drawCtx.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
    this.saveHistory();
  }

  createFinalCanvas() {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = this.backgroundCanvas.width;
    outputCanvas.height = this.backgroundCanvas.height;
    const outputCtx = outputCanvas.getContext('2d');

    // Draw background
    outputCtx.drawImage(this.backgroundCanvas, 0, 0);

    // Draw annotations
    outputCtx.drawImage(this.drawingCanvas, 0, 0);

    return outputCanvas;
  }

  getFinalImage(format = 'png', quality = 0.92) {
    const outputCanvas = this.createFinalCanvas();

    // Convert to data URL
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    return outputCanvas.toDataURL(mimeType, quality);
  }

  async getFinalPdfDataUrl(quality = 0.92) {
    const outputCanvas = this.createFinalCanvas();
    const jpegBlob = await new Promise((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create PDF image blob'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    });

    return createPdfDataUrlFromJpegBlob(jpegBlob, outputCanvas.width, outputCanvas.height);
  }

  async save() {
    const format = document.getElementById('format-select').value;

    const settings = await chrome.storage.sync.get({
      filePrefix: 'screenshot',
      jpegQuality: 92
    });

    const jpegQuality = Math.min(100, Math.max(1, Number(settings.jpegQuality) || 92)) / 100;
    const imageData = format === 'pdf'
      ? await this.getFinalPdfDataUrl(jpegQuality)
      : this.getFinalImage(format, jpegQuality);

    // Generate filename
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];
    const extension = format === 'jpeg' ? 'jpg' : format;
    const filename = `${settings.filePrefix}_${timestamp}.${extension}`;

    // Convert data URL to blob for reliable download (data URLs can be blocked by Chrome)
    const response = await fetch(imageData);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      await chrome.downloads.download({
        url: blobUrl,
        filename,
        saveAs: false
      });
      this.showNotification(chrome.i18n.getMessage('msgDownloaded') || 'Downloaded');
    } catch (error) {
      console.error('Download failed:', error);
      this.showNotification('Download failed', 'error');
    } finally {
      // Clean up blob URL after a delay to ensure download starts
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
  }

  async copyToClipboard() {
    const format = document.getElementById('format-select').value;

    if (format === 'pdf') {
      this.showNotification('PDF cannot be copied to clipboard', 'error');
      return;
    }

    try {
      const imageData = this.getFinalImage('png');
      const response = await fetch(imageData);
      const blob = await response.blob();

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);

      this.showNotification(chrome.i18n.getMessage('msgCopied') || 'Copied to clipboard');
    } catch (error) {
      console.error('Copy failed:', error);
      this.showNotification('Copy failed', 'error');
    }
  }

  cancel() {
    // Clear stored data
    chrome.storage.local.remove(['pendingImage', 'captureOptions']);
    window.close();
  }

  showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === 'error' ? '#dc2626' : '#059669'};
      color: #fff;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
      animation: slideUp 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { opacity: 0; transform: translate(-50%, 20px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
    `;
    document.head.appendChild(style);

    // Remove after delay
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 3000);
  }
}

// Initialize editor
document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotEditor();
});

async function createPdfDataUrlFromJpegBlob(jpegBlob, widthPx, heightPx) {
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdfBytes = buildPdfFromJpegBytes(jpegBytes, widthPx, heightPx);
  return `data:application/pdf;base64,${bytesToBase64(pdfBytes)}`;
}

function buildPdfFromJpegBytes(jpegBytes, widthPx, heightPx) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let totalLength = 0;
  const objectCount = 5;

  const pushBytes = (bytes) => {
    parts.push(bytes);
    totalLength += bytes.length;
  };

  const pushText = (text) => {
    pushBytes(encoder.encode(text));
  };

  const widthPt = Math.max(1, Math.round(widthPx * 72 / 96));
  const heightPt = Math.max(1, Math.round(heightPx * 72 / 96));
  const contentStream = `q\n${widthPt} 0 0 ${heightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);

  pushText('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const startObject = (id) => {
    offsets[id] = totalLength;
    pushText(`${id} 0 obj\n`);
  };

  const endObject = () => {
    pushText('\nendobj\n');
  };

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
  pushText(`xref\n0 ${objectCount + 1}\n`);
  pushText('0000000000 65535 f \n');
  for (let i = 1; i <= objectCount; i += 1) {
    pushText(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`);
  pushText(`startxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(totalLength);
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
