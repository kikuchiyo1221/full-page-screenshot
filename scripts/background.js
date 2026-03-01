// Service Worker for Full Page Screenshot Extension

// Guard against double capture execution
let captureInProgress = false;

// Alarm handler for delayed capture
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'delayed-capture') {
    try {
      // Get stored capture data
      const { delayedCaptureData } = await chrome.storage.local.get('delayedCaptureData');
      if (delayedCaptureData) {
        const { tabId, options } = delayedCaptureData;

        // Get the tab (it might have changed)
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab) {
          // Add flag to skip resize-triggering operations (preserves dropdowns)
          await executeCapture(tab, { ...options, fromDelayedCapture: true });
        }

        // Clear stored data
        await chrome.storage.local.remove('delayedCaptureData');
      }
    } catch (error) {
      console.error('Delayed capture error:', error);
    }
  }
});

// Context Menu Setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'capture-full-page',
    title: chrome.i18n.getMessage('contextMenuFullPage') || 'Capture Full Page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-selection',
    title: chrome.i18n.getMessage('contextMenuSelection') || 'Capture Selection',
    contexts: ['page']
  });

  // Initialize default settings
  chrome.storage.sync.get({
    defaultFormat: 'png',
    jpegQuality: 92,
    defaultSaveDownload: true,
    defaultSaveClipboard: false,
    filePrefix: 'screenshot'
  }, (settings) => {
    chrome.storage.sync.set(settings);
  });
});

// Context Menu Click Handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-full-page') {
    handleCapture(tab, { mode: 'fullPage' });
  } else if (info.menuItemId === 'capture-selection') {
    handleCapture(tab, { mode: 'selection' });
  }
});

// Keyboard Shortcut Handler
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture-full-page') {
    handleCapture(tab, { mode: 'fullPage' });
  } else if (command === 'capture-selection') {
    handleCapture(tab, { mode: 'selection' });
  }
});

// Message Handler from Popup and Content Scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    handleCaptureFromPopup(request.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'saveImage') {
    saveImage(request.imageData, request.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Handle captureVisibleTab request from content script
  if (request.action === 'captureVisibleTab') {
    const windowId = sender.tab?.windowId ?? null;
    captureVisibleTab(windowId)
      .then(dataUrl => sendResponse(dataUrl))
      .catch(error => sendResponse(null));
    return true;
  }
});

// Handle capture from popup
async function handleCaptureFromPopup(options) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error('No active tab found');
  }

  return handleCapture(tab, options);
}

// Main capture handler
async function handleCapture(tab, options) {
  const settings = await chrome.storage.sync.get({
    defaultFormat: 'png',
    jpegQuality: 92,
    defaultSaveDownload: true,
    defaultSaveClipboard: false,
    filePrefix: 'screenshot'
  });

  const captureOptions = {
    format: options.format || settings.defaultFormat,
    jpegQuality: settings.jpegQuality,
    saveDownload: options.saveDownload ?? settings.defaultSaveDownload,
    saveClipboard: options.saveClipboard ?? settings.defaultSaveClipboard,
    filePrefix: settings.filePrefix,
    mode: options.mode || 'fullPage',
    delaySeconds: options.delaySeconds || 0
  };

  try {
    // Handle delay using alarms API (Service Worker safe)
    if (captureOptions.mode === 'delay' && captureOptions.delaySeconds > 0) {
      const delayMode = options.delayMode || 'visible';

      // Store capture data for alarm handler
      await chrome.storage.local.set({
        delayedCaptureData: {
          tabId: tab.id,
          options: {
            ...captureOptions,
            mode: 'fullPage',
            delaySeconds: 0,
            delayMode: delayMode,
            fromDelayedCapture: true
          }
        }
      });

      // Create alarm (delayInMinutes minimum is 0.5 for repeating, but one-time can use when)
      await chrome.alarms.create('delayed-capture', {
        when: Date.now() + (captureOptions.delaySeconds * 1000)
      });

      return { success: true, delayed: true };
    }

    // Execute capture immediately
    return await executeCapture(tab, captureOptions);
  } catch (error) {
    console.error('Capture error:', error);
    throw error;
  }
}

// Execute the actual capture
async function executeCapture(tab, captureOptions) {
  if (captureInProgress) {
    console.log('Capture already in progress, skipping');
    return { success: false, error: 'Capture in progress' };
  }
  captureInProgress = true;

  try {
    let imageData;

    if (captureOptions.mode === 'selection') {
      imageData = await captureSelection(tab);
      if (!imageData) {
        return { success: false, canceled: true };
      }
    } else if (captureOptions.fromDelayedCapture) {
      // Delayed capture: check mode preference
      if (captureOptions.delayMode === 'fullPage') {
        imageData = await captureFullPage(tab, captureOptions);
      } else {
        // Visible area only (preserves dropdowns/menus)
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async () => {
            const images = document.querySelectorAll('img');
            const promises = Array.from(images).map(img => {
              if (img.complete) return Promise.resolve();
              if (img.dataset.src) img.src = img.dataset.src;
              if (img.loading === 'lazy') img.loading = 'eager';
              return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 1000);
              });
            });
            await Promise.all(promises);
            await new Promise(r => setTimeout(r, 200));
          }
        });
        imageData = await captureVisibleTabForTab(tab);
      }
    } else {
      // Normal full page capture
      imageData = await captureFullPage(tab, captureOptions);
    }

    // Open editor with captured image
    await openEditor(tab, imageData, captureOptions);
    return { success: true };
  } finally {
    captureInProgress = false;
  }
}


// Capture visible tab
async function captureVisibleTab(windowId = null) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

async function captureVisibleTabForTab(tab) {
  const tabId = tab.id;
  let attached = false;

  try {
    await attachDebugger(tabId);
    attached = true;

    const result = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });

    return 'data:image/png;base64,' + result.data;
  } catch (error) {
    console.warn('Tab-specific visible capture failed, falling back:', error);
    return captureVisibleTab(tab.windowId ?? null);
  } finally {
    if (attached) {
      await detachDebugger(tabId);
    }
  }
}

// Full page capture using Chrome DevTools Protocol
async function captureFullPage(tab, options) {
  const tabId = tab.id;
  let debuggerAttached = false;
  let fixedElementsHidden = false;

  try {
    // Record initial page height before lazy loading scroll
    const [initialHeightResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    });
    const initialPageHeight = initialHeightResult.result;

    // Scroll through the page to trigger lazy loading
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const originalScrollY = window.scrollY;
        const viewportHeight = window.innerHeight;
        const totalHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );

        // Force eager loading for all lazy images before scrolling
        const allImages = document.querySelectorAll('img');
        allImages.forEach(img => {
          // Handle data-src lazy loading pattern (common in libraries like lazysizes)
          if (img.dataset.src && !img.src) {
            img.src = img.dataset.src;
          }
          // Handle srcset lazy loading
          if (img.dataset.srcset && !img.srcset) {
            img.srcset = img.dataset.srcset;
          }
          // Force eager loading
          if (img.loading === 'lazy') {
            img.loading = 'eager';
          }
        });

        // Handle picture elements with lazy-loaded sources
        const pictures = document.querySelectorAll('picture');
        pictures.forEach(picture => {
          const sources = picture.querySelectorAll('source');
          sources.forEach(source => {
            if (source.dataset.srcset && !source.srcset) {
              source.srcset = source.dataset.srcset;
            }
          });
        });

        // Trigger load for background images by accessing computed styles
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          // Handle data-background lazy loading pattern
          if (el.dataset.background) {
            el.style.backgroundImage = `url(${el.dataset.background})`;
          }
          if (el.dataset.bg) {
            el.style.backgroundImage = `url(${el.dataset.bg})`;
          }
        });

        // Scroll through entire page to trigger lazy loading (including Intersection Observer)
        const scrollStep = Math.floor(viewportHeight * 0.7); // 70% of viewport for overlap
        // Single scroll pass through initial height to trigger lazy loading
        // (Multiple passes trigger infinite scroll, duplicating content)
        for (let y = 0; y < totalHeight; y += scrollStep) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 300));
        }

        // Scroll to bottom briefly
        window.scrollTo(0, totalHeight);
        await new Promise(r => setTimeout(r, 500));

        // Scroll back to original position
        window.scrollTo(0, originalScrollY);

        // Wait for layout to stabilize after scroll
        await new Promise(r => setTimeout(r, 200));

        // Wait for all images to load with longer timeout
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(
          images.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 5000); // 5s timeout per image (increased from 2s)
            });
          })
        );

        // Additional wait for CSS background images, web fonts, and final rendering
        await new Promise(r => setTimeout(r, 800));
      }
    });

    // Attach debugger
    await attachDebugger(tabId);
    debuggerAttached = true;

    // Get page dimensions and viewport info
    const {
      pageHeight: measuredPageHeight,
      viewportWidth,
      viewportHeight,
      devicePixelRatio
    } = await evaluateWithDebugger(
      tabId,
      `(() => ({
        pageHeight: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      }))()`
    );

    let pageHeight = measuredPageHeight;
    const dpr = devicePixelRatio;

    // Cap page height to prevent infinite scroll from duplicating content
    if (pageHeight > initialPageHeight * 1.5) {
      console.log(`Capping page height from ${pageHeight} to ${initialPageHeight} (infinite scroll detected)`);
      pageHeight = initialPageHeight;
    }

    console.log(`Page: ${viewportWidth}x${pageHeight}px, viewport: ${viewportHeight}px, dpr: ${dpr}`);

    // Hide fixed/sticky elements so they don't repeat in every chunk
    await hideFixedElementsWithDebugger(tabId);
    fixedElementsHidden = true;

    // Scroll-and-stitch: capture viewport-sized chunks and draw at actual scroll positions
    const chunks = [];
    let targetY = 0;

    while (targetY < pageHeight) {
      // Clamp so viewport bottom doesn't exceed page bottom
      const clampedY = Math.min(targetY, Math.max(0, pageHeight - viewportHeight));

      const actualY = await scrollToPositionWithDebugger(tabId, clampedY);

      const screenshot = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
      });

      chunks.push({ data: screenshot.data, scrollY: actualY });

      // Stop if we've captured to the bottom
      if (actualY + viewportHeight >= pageHeight) break;

      // Next position: advance by viewport minus overlap (prevents gaps from rounding)
      const overlap = Math.min(50, Math.floor(viewportHeight * 0.05));
      targetY = actualY + viewportHeight - overlap;
    }

    // Detach debugger immediately after screenshots (no longer needed)
    if (debuggerAttached) {
      await detachDebugger(tabId);
      debuggerAttached = false;
    }

    // Restore hidden elements
    if (fixedElementsHidden) {
      await restoreHiddenElements(tabId);
      fixedElementsHidden = false;
    }

    // Stitch: crop overlap and clamp rounding so adjacent chunks stay contiguous.
    const totalWidthPx = Math.max(1, Math.ceil(viewportWidth * dpr));
    const totalHeightPx = Math.max(1, Math.ceil(pageHeight * dpr));
    const canvas = new OffscreenCanvas(totalWidthPx, totalHeightPx);
    const ctx = canvas.getContext('2d');
    let previousDrawEndY = 0;
    let isFirstChunk = true;

    for (const chunk of chunks) {
      const blob = base64ToBlob(chunk.data, 'image/png');
      const bitmap = await createImageBitmap(blob);

      let destY = Math.round(chunk.scrollY * dpr);
      let srcY = 0;

      if (!isFirstChunk) {
        if (destY < previousDrawEndY) {
          srcY = previousDrawEndY - destY;
        }
        destY = previousDrawEndY;
      }

      const drawHeight = Math.min(bitmap.height - srcY, totalHeightPx - destY);
      if (drawHeight > 0) {
        ctx.drawImage(
          bitmap,
          0,
          srcY,
          bitmap.width,
          drawHeight,
          0,
          destY,
          bitmap.width,
          drawHeight
        );
        previousDrawEndY = destY + drawHeight;
        isFirstChunk = false;
      }

      bitmap.close();
    }

    // Convert to data URL
    const resultBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await resultBlob.arrayBuffer();
    const base64 = bytesToBase64(new Uint8Array(arrayBuffer));
    return 'data:image/png;base64,' + base64;

  } catch (error) {
    console.error('CDP capture error:', error);

    if (debuggerAttached) {
      await detachDebugger(tabId);
      debuggerAttached = false;
    }

    if (fixedElementsHidden) {
      await restoreHiddenElements(tabId);
      fixedElementsHidden = false;
    }

    // Fallback to visible area capture
    console.log('CDP failed, falling back to visible area capture');
    return await captureVisibleTab(tab.windowId ?? null);
  } finally {
    if (debuggerAttached) {
      await detachDebugger(tabId);
    }
    if (fixedElementsHidden) {
      await restoreHiddenElements(tabId);
    }
  }
}

async function evaluateWithDebugger(tabId, expression) {
  const evaluation = await sendDebuggerCommand(tabId, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (evaluation.exceptionDetails) {
    const message =
      evaluation.exceptionDetails.exception?.description ||
      evaluation.exceptionDetails.text ||
      'Runtime.evaluate failed';
    throw new Error(message);
  }

  return evaluation.result?.value;
}

async function hideFixedElementsWithDebugger(tabId) {
  await evaluateWithDebugger(
    tabId,
    `(() => {
      const existingSheet = document.getElementById('__ss-capture-fix');
      if (existingSheet) {
        existingSheet.remove();
      }

      document.querySelectorAll('[data-ss-hide]').forEach(el => {
        delete el.dataset.ssHide;
      });

      const sheet = document.createElement('style');
      sheet.id = '__ss-capture-fix';

      document.querySelectorAll('*').forEach(el => {
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') {
          el.dataset.ssHide = '1';
        }
      });

      sheet.textContent = '[data-ss-hide] { display: none !important; }';
      document.head.appendChild(sheet);
      return true;
    })()`
  );
}

async function scrollToPositionWithDebugger(tabId, targetY) {
  const clampedY = Math.max(0, Math.round(targetY));

  return evaluateWithDebugger(
    tabId,
    `new Promise(resolve => {
      window.scrollTo(0, ${clampedY});
      requestAnimationFrame(() => {
        setTimeout(() => resolve(window.scrollY), 200);
      });
    })`
  );
}

async function restoreHiddenElements(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sheet = document.getElementById('__ss-capture-fix');
        if (sheet) sheet.remove();
        document.querySelectorAll('[data-ss-hide]').forEach(el => {
          delete el.dataset.ssHide;
        });
      }
    });
  } catch (error) {
    console.warn('Failed to restore hidden capture elements:', error);
  }
}

// Wait for network idle using CDP Network domain
async function waitForNetworkIdle(tabId, idleTime = 1500, timeout = 8000) {
  let pendingRequests = 0;
  let idleTimer = null;
  let listener = null;

  try {
    await sendDebuggerCommand(tabId, 'Network.enable', {});

    await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, timeout);

      const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(timeoutId);
        if (listener) {
          chrome.debugger.onEvent.removeListener(listener);
          listener = null;
        }
      };

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (pendingRequests <= 0) {
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, idleTime);
        }
      };

      listener = (source, method) => {
        if (source.tabId !== tabId) return;
        if (method === 'Network.requestWillBeSent') {
          pendingRequests++;
          if (idleTimer) clearTimeout(idleTimer);
        } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
          pendingRequests = Math.max(0, pendingRequests - 1);
          resetIdleTimer();
        }
      };

      chrome.debugger.onEvent.addListener(listener);
      // Start idle timer in case there are already no pending requests
      resetIdleTimer();
    });
  } catch (e) {
    // Fallback: just wait a fixed time
    await new Promise(r => setTimeout(r, idleTime));
  } finally {
    if (listener) {
      chrome.debugger.onEvent.removeListener(listener);
    }
    try {
      await sendDebuggerCommand(tabId, 'Network.disable', {});
    } catch (e) {
      // Ignore
    }
  }
}

// Helper to send debugger commands with auto-reattach on failure
async function sendDebuggerCommand(tabId, method, params = {}) {
  try {
    return await _sendDebuggerCommandRaw(tabId, method, params);
  } catch (error) {
    // If debugger was detached, try to reattach once
    if (error.message && error.message.includes('not attached')) {
      console.log('Debugger detached, reattaching...');
      await attachDebugger(tabId);
      return await _sendDebuggerCommandRaw(tabId, method, params);
    }
    throw error;
  }
}

function _sendDebuggerCommandRaw(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function detachDebugger(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => resolve());
  });
}

// Capture selection mode
async function captureSelection(tab) {
  const timeoutMs = 120000;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      chrome.runtime.onMessage.removeListener(listener);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const listener = (message, sender) => {
      if (sender.tab?.id !== tab.id) return;

      if (message.action === 'selectionComplete') {
        settleResolve(message.imageData || null);
      } else if (message.action === 'selectionCanceled') {
        settleResolve(null);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    timeoutId = setTimeout(() => {
      settleReject(new Error('Selection capture timed out'));
    }, timeoutMs);

    const requestSelectionStart = (allowInjectionFallback) => {
      chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, async (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || '';
          const shouldInject =
            allowInjectionFallback &&
            errorMessage.includes('Receiving end does not exist');

          if (shouldInject) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['scripts/content.js']
              });
              await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['scripts/content.css']
              });
              requestSelectionStart(false);
            } catch (error) {
              settleReject(error instanceof Error ? error : new Error(String(error)));
            }
            return;
          }

          settleReject(new Error(errorMessage));
        } else if (!response || !response.success) {
          settleReject(new Error('Failed to start selection'));
        }
      });
    };

    requestSelectionStart(true);
  });
}

// Open editor with captured image
async function openEditor(tab, imageData, options) {
  // Store image data temporarily
  await chrome.storage.local.set({
    pendingImage: imageData,
    captureOptions: options
  });

  // Open editor in new tab
  await chrome.tabs.create({
    url: chrome.runtime.getURL('editor/editor.html'),
    index: tab.index + 1
  });
}

// Save image to file
async function saveImage(imageData, options) {
  const { format, filePrefix, jpegQuality, saveDownload, saveClipboard } = options;

  // Generate filename
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];
  const extension = format === 'jpeg' ? 'jpg' : format;
  const filename = `${filePrefix}_${timestamp}.${extension}`;

  // Convert image if needed
  let outputData = imageData;
  if (format === 'jpeg' || format === 'pdf') {
    outputData = await convertImage(imageData, format, jpegQuality);
  }

  const results = { downloaded: false, copied: false };

  // Download file
  if (saveDownload) {
    const blob = dataURLtoBlob(outputData);
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename,
      saveAs: false
    });

    results.downloaded = true;
  }

  // Copy to clipboard
  if (saveClipboard && format !== 'pdf') {
    try {
      const blob = dataURLtoBlob(imageData);
      // Note: Clipboard API requires user gesture in content script
      // This will be handled in the editor page
      results.clipboardData = imageData;
    } catch (error) {
      console.warn('Clipboard copy failed:', error);
    }
  }

  return { success: true, ...results };
}

// Convert image format
async function convertImage(dataUrl, format, quality = 92) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
  const ctx = canvas.getContext('2d');

  if (format === 'jpeg') {
    // Fill white background for JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(imageBitmap, 0, 0);

  let outputBlob;
  if (format === 'jpeg') {
    outputBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
  } else if (format === 'pdf') {
    const jpegBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: quality / 100
    });
    return createPdfDataUrlFromJpegBlob(jpegBlob, canvas.width, canvas.height);
  } else {
    outputBlob = await canvas.convertToBlob({ type: 'image/png' });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(outputBlob);
  });
}

// Helper: Convert data URL to Blob
function dataURLtoBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

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

function base64ToBlob(base64, mimeType = 'image/png') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
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
