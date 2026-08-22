// Content script: the drag-to-select overlay used by selection capture.
//
// Content scripts cannot be ES modules, so this file is self-contained.

(function () {
  if (window.__screenshotContentInitialized) return;
  window.__screenshotContentInitialized = true;

  const OVERLAY_ID = 'screenshot-selection-overlay';
  const MIN_SELECTION_PX = 10;
  /** Let the browser paint one frame with the overlay hidden before capturing. */
  const HIDE_OVERLAY_DELAY_MS = 50;

  /** @type {SelectionOverlay|null} */
  let activeOverlay = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'startSelection') return false;

    if (activeOverlay) {
      sendResponse({ success: true, alreadyActive: true });
      return false;
    }

    activeOverlay = new SelectionOverlay(() => { activeOverlay = null; });
    activeOverlay.open();
    sendResponse({ success: true });
    return false;
  });

  class SelectionOverlay {
    #root = null;
    #box = null;
    #dimensions = null;
    #instructions = null;
    #startX = 0;
    #startY = 0;
    #isSelecting = false;
    #onClosed;

    constructor(onClosed) {
      this.#onClosed = onClosed;
      this.onMouseDown = this.onMouseDown.bind(this);
      this.onMouseMove = this.onMouseMove.bind(this);
      this.onMouseUp = this.onMouseUp.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    open() {
      const instructions =
        chrome.i18n.getMessage('msgSelectArea') || 'Drag to select the area to capture';

      this.#root = document.createElement('div');
      this.#root.id = OVERLAY_ID;
      this.#root.innerHTML = `
        <div class="screenshot-selection-instructions">
          ${instructions}
          <span class="screenshot-selection-hint">ESC to cancel</span>
        </div>
        <div class="screenshot-selection-box"></div>
        <div class="screenshot-selection-dimensions"></div>
      `;
      document.body.appendChild(this.#root);

      this.#box = this.#root.querySelector('.screenshot-selection-box');
      this.#dimensions = this.#root.querySelector('.screenshot-selection-dimensions');
      this.#instructions = this.#root.querySelector('.screenshot-selection-instructions');

      this.#root.addEventListener('mousedown', this.onMouseDown);
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
      document.addEventListener('keydown', this.onKeyDown);
    }

    close() {
      if (!this.#root) return;

      this.#root.removeEventListener('mousedown', this.onMouseDown);
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUp);
      document.removeEventListener('keydown', this.onKeyDown);

      this.#root.remove();
      this.#root = null;
      this.#box = null;
      this.#dimensions = null;
      this.#instructions = null;
      this.#onClosed();
    }

    onMouseDown(event) {
      if (event.button !== 0) return;

      this.#isSelecting = true;
      this.#startX = event.clientX;
      this.#startY = event.clientY;

      Object.assign(this.#box.style, {
        left: `${this.#startX}px`,
        top: `${this.#startY}px`,
        width: '0',
        height: '0',
        display: 'block'
      });
      this.#instructions.classList.add('hidden');
    }

    onMouseMove(event) {
      if (!this.#isSelecting) return;

      const left = Math.min(this.#startX, event.clientX);
      const top = Math.min(this.#startY, event.clientY);
      const width = Math.abs(event.clientX - this.#startX);
      const height = Math.abs(event.clientY - this.#startY);

      Object.assign(this.#box.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`
      });

      this.#dimensions.textContent = `${width} × ${height}`;
      Object.assign(this.#dimensions.style, {
        left: `${left + width + 10}px`,
        top: `${top + height / 2}px`,
        display: 'block'
      });
    }

    async onMouseUp() {
      if (!this.#isSelecting) return;
      this.#isSelecting = false;

      const rect = this.#box.getBoundingClientRect();
      if (rect.width < MIN_SELECTION_PX || rect.height < MIN_SELECTION_PX) {
        notifyCanceled('selection-too-small');
        this.close();
        return;
      }

      this.#root.style.display = 'none';
      await sleep(HIDE_OVERLAY_DELAY_MS);

      try {
        const imageData = await captureRegion(rect);
        chrome.runtime.sendMessage({ action: 'selectionComplete', imageData });
      } catch (error) {
        console.error('Selection capture failed:', error);
        notifyCanceled('capture-failed');
      } finally {
        this.close();
      }
    }

    onKeyDown(event) {
      if (event.key !== 'Escape') return;
      notifyCanceled('user-canceled');
      this.close();
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function notifyCanceled(reason) {
    chrome.runtime.sendMessage({ action: 'selectionCanceled', reason }, () => {
      void chrome.runtime.lastError; // Ignore messaging errors during teardown.
    });
  }

  function requestVisibleTabCapture() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!dataUrl) {
          reject(new Error('No screenshot data received'));
        } else {
          resolve(dataUrl);
        }
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });
  }

  /** Crop `rect` (CSS pixels, viewport-relative) out of a screenshot of the viewport. */
  async function captureRegion(rect) {
    const image = await loadImage(await requestVisibleTabCapture());

    // The screenshot is scaled by the device pixel ratio *and* the browser's zoom
    // level, so derive the scale from the image itself instead of assuming DPR.
    const scale = image.width / window.innerWidth;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);

    canvas.getContext('2d').drawImage(
      image,
      rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale,
      0, 0, canvas.width, canvas.height
    );

    return canvas.toDataURL('image/png');
  }
})();
