// Service Worker for Full Page Screenshot Extension

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
    captureVisibleTab()
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
  let imageData;

  if (captureOptions.mode === 'selection') {
    imageData = await captureSelection(tab);
  } else if (captureOptions.fromDelayedCapture) {
    // Delayed capture: check mode preference
    if (captureOptions.delayMode === 'fullPage') {
      // Full page delayed capture (may close some dropdowns due to resize)
      imageData = await captureFullPage(tab, captureOptions);
    } else {
      // Visible area only (preserves dropdowns/menus)
      // First, trigger loading of visible images
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          // Force load all images in viewport
          const images = document.querySelectorAll('img');
          const promises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            // Trigger load by accessing src
            if (img.dataset.src) {
              img.src = img.dataset.src;
            }
            if (img.loading === 'lazy') {
              img.loading = 'eager';
            }
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 1000);
            });
          });
          await Promise.all(promises);
          // Small additional wait
          await new Promise(r => setTimeout(r, 200));
        }
      });
      imageData = await captureVisibleTab();
    }
  } else {
    // Normal full page capture
    imageData = await captureFullPage(tab, captureOptions);
  }

  // Open editor with captured image
  await openEditor(tab, imageData, captureOptions);

  return { success: true };
}

// Capture visible tab
async function captureVisibleTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

// Full page capture using Chrome DevTools Protocol
async function captureFullPage(tab, options) {
  const tabId = tab.id;

  try {
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

        // Scroll through entire page to trigger lazy loading
        for (let y = 0; y < totalHeight; y += viewportHeight) {
          window.scrollTo(0, y);
          await new Promise(r => setTimeout(r, 100));
        }

        // Scroll back to original position
        window.scrollTo(0, originalScrollY);

        // Wait for all images to load
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(
          images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 2000); // 2s timeout per image
            });
          })
        );

        // Additional wait for any CSS background images and rendering
        await new Promise(r => setTimeout(r, 500));
      }
    });

    // Attach debugger
    await new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Get page dimensions
    const [dimensions] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ),
        height: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ),
        devicePixelRatio: window.devicePixelRatio || 1
      })
    });

    const { width, height, devicePixelRatio } = dimensions.result;

    // Set device metrics to capture full page
    await sendDebuggerCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
      width: width,
      height: height,
      deviceScaleFactor: devicePixelRatio,
      mobile: false
    });

    // Wait for rendering after metrics change
    await new Promise(r => setTimeout(r, 500));

    // Capture screenshot
    const result = await sendDebuggerCommand(tabId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    // Reset device metrics
    await sendDebuggerCommand(tabId, 'Emulation.clearDeviceMetricsOverride', {});

    // Detach debugger
    await new Promise(resolve => {
      chrome.debugger.detach({ tabId }, resolve);
    });

    // Convert base64 to data URL
    return 'data:image/png;base64,' + result.data;

  } catch (error) {
    console.error('CDP capture error:', error);

    // Try to detach debugger on error
    try {
      await new Promise(resolve => chrome.debugger.detach({ tabId }, resolve));
    } catch (e) {
      // Ignore detach errors
    }

    // Fallback to visible area capture
    console.log('CDP failed, falling back to visible area capture');
    return await captureVisibleTab();
  }
}

// Helper to send debugger commands
function sendDebuggerCommand(tabId, method, params = {}) {
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

// Capture selection mode
async function captureSelection(tab) {
  // Inject selection overlay
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['scripts/content.js']
  });

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['scripts/content.css']
  });

  // Send message to start selection
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success) {
        // Wait for selection complete message
        const listener = (message, sender) => {
          if (sender.tab?.id === tab.id && message.action === 'selectionComplete') {
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message.imageData);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
      } else {
        reject(new Error('Failed to start selection'));
      }
    });
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
    // PDF conversion would require a library - for now return PNG
    outputBlob = await canvas.convertToBlob({ type: 'image/png' });
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
