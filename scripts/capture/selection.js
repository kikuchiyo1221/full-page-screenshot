// Selection capture: hand control to the content script's drag overlay and
// wait for it to report back with a cropped image.

import { SELECTION_TIMEOUT_MS } from './constants.js';

const CONTENT_SCRIPT_FILES = ['scripts/content.js'];
const CONTENT_STYLE_FILES = ['scripts/content.css'];

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Inject the overlay on demand.
 *
 * The overlay is not registered as a declarative content script: that would mean
 * running code on every page the user visits and asking for host permissions on
 * all URLs. Injecting here keeps the extension on activeTab only. Re-injecting an
 * already-injected tab is harmless — content.js guards against double init.
 */
async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPT_FILES });
  await chrome.scripting.insertCSS({ target: { tabId }, files: CONTENT_STYLE_FILES });
}

async function startSelection(tabId) {
  await injectContentScript(tabId);
  const response = await sendMessageToTab(tabId, { action: 'startSelection' });

  if (!response?.success) {
    throw new Error('Failed to start selection');
  }
}

/**
 * @returns {Promise<string|null>} a PNG data URL, or null if the user canceled.
 */
export function captureSelection(tab) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (settleWith, value) => {
      if (settled) return;
      settled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
      clearTimeout(timeoutId);
      settleWith(value);
    };

    const onMessage = (message, sender) => {
      if (sender.tab?.id !== tab.id) return;
      if (message.action === 'selectionComplete') {
        finish(resolve, message.imageData || null);
      } else if (message.action === 'selectionCanceled') {
        finish(resolve, null);
      }
    };

    const timeoutId = setTimeout(
      () => finish(reject, new Error('Selection capture timed out')),
      SELECTION_TIMEOUT_MS
    );

    chrome.runtime.onMessage.addListener(onMessage);
    startSelection(tab.id).catch((error) => finish(reject, error));
  });
}
