// Content Script for Selection Capture

(function() {
  // Prevent duplicate initialization
  if (window.__screenshotContentInitialized) {
    return;
  }
  window.__screenshotContentInitialized = true;

  let overlay = null;
  let selectionBox = null;
  let startX = 0;
  let startY = 0;
  let isSelecting = false;

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSelection') {
      if (window.__screenshotSelectionActive) {
        sendResponse({ success: true, alreadyActive: true });
        return true;
      }
      startSelectionMode();
      sendResponse({ success: true });
    }
    return true;
  });

  function startSelectionMode() {
    window.__screenshotSelectionActive = true;

    // Create overlay
    overlay = document.createElement('div');
    overlay.id = 'screenshot-selection-overlay';
    overlay.innerHTML = `
      <div class="screenshot-selection-instructions">
        ${chrome.i18n.getMessage('msgSelectArea') || 'Drag to select the area to capture'}
        <span class="screenshot-selection-hint">ESC to cancel</span>
      </div>
      <div class="screenshot-selection-box"></div>
      <div class="screenshot-selection-dimensions"></div>
    `;
    document.body.appendChild(overlay);

    selectionBox = overlay.querySelector('.screenshot-selection-box');
    const dimensions = overlay.querySelector('.screenshot-selection-dimensions');

    // Event handlers
    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;

      selectionBox.style.left = startX + 'px';
      selectionBox.style.top = startY + 'px';
      selectionBox.style.width = '0';
      selectionBox.style.height = '0';
      selectionBox.style.display = 'block';

      overlay.querySelector('.screenshot-selection-instructions').classList.add('hidden');
    };

    const handleMouseMove = (e) => {
      if (!isSelecting) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = left + 'px';
      selectionBox.style.top = top + 'px';
      selectionBox.style.width = width + 'px';
      selectionBox.style.height = height + 'px';

      // Show dimensions
      dimensions.textContent = `${width} × ${height}`;
      dimensions.style.left = (left + width + 10) + 'px';
      dimensions.style.top = (top + height / 2) + 'px';
      dimensions.style.display = 'block';
    };

    const handleMouseUp = async (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      const rect = selectionBox.getBoundingClientRect();

      // Validate selection size
      if (rect.width < 10 || rect.height < 10) {
        notifySelectionCanceled('selection-too-small');
        cleanup();
        return;
      }

      // Hide overlay before capture
      overlay.style.display = 'none';

      // Wait for render
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        // Capture the selected region
        const imageData = await captureRegion(rect);

        // Send result to background
        chrome.runtime.sendMessage({
          action: 'selectionComplete',
          imageData: imageData
        });
      } catch (error) {
        console.error('Selection capture failed:', error);
        notifySelectionCanceled('capture-failed');
      } finally {
        cleanup();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        notifySelectionCanceled('user-canceled');
        cleanup();
      }
    };

    const cleanup = () => {
      window.__screenshotSelectionActive = false;
      if (!overlay) return;
      overlay.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      overlay = null;
      selectionBox = null;
    };

    // Attach event listeners
    overlay.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
  }

  async function captureRegion(rect) {
    // Request full screenshot from background
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'captureVisibleTab' }, async (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          reject(new Error('No screenshot data received'));
          return;
        }

        try {
          // Crop the image
          const img = new Image();
          img.onload = () => {
            const dpr = window.devicePixelRatio;
            const canvas = document.createElement('canvas');
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(
              img,
              rect.left * dpr,
              rect.top * dpr,
              rect.width * dpr,
              rect.height * dpr,
              0,
              0,
              rect.width * dpr,
              rect.height * dpr
            );

            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = response;
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  function notifySelectionCanceled(reason) {
    chrome.runtime.sendMessage({
      action: 'selectionCanceled',
      reason
    }, () => {
      // Ignore runtime messaging errors during teardown.
      void chrome.runtime.lastError;
    });
  }
})();
