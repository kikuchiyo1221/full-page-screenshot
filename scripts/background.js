// Service worker: wires up the extension's entry points and orchestrates a capture.
// The capture mechanics live in ./capture/*.

import { loadSettings } from '../lib/settings.js';
import { captureFullPage } from './capture/full-page.js';
import { captureSelection } from './capture/selection.js';
import { captureTab, captureVisibleTab } from './capture/visible.js';
import { primeVisibleContent } from './capture/page-actions.js';

const DELAYED_CAPTURE_ALARM = 'delayed-capture';
const DELAYED_CAPTURE_KEY = 'delayedCaptureData';

const ERROR_BADGE = '!';
const ERROR_BADGE_COLOR = '#dc2626';

/**
 * Chrome's own wording for "this extension has no access here" — chrome:// pages,
 * the Web Store, other extensions' pages. The sentence differs between the
 * scripting, tabs and captureVisibleTab APIs, and a page the extension may not
 * touch reports it as an ungranted activeTab, so all of them are matched.
 */
const RESTRICTED_PAGE_PATTERN = new RegExp([
  "'activeTab' permission is not in effect",
  'cannot be scripted',
  'cannot access',
  'extension manifest must request permission',
  'chrome://',
  'chrome-extension://'
].join('|'), 'i');

const CONTEXT_MENU_ITEMS = [
  { id: 'capture-full-page', messageKey: 'contextMenuFullPage', fallback: 'Capture Full Page' },
  { id: 'capture-selection', messageKey: 'contextMenuSelection', fallback: 'Capture Selection' }
];

// A capture drives the page it captures; running two at once would fight over
// scroll position and the debugger.
let captureInProgress = false;

/* ------------------------------------------------------------- entry points -- */

chrome.runtime.onInstalled.addListener(async () => {
  for (const { id, messageKey, fallback } of CONTEXT_MENU_ITEMS) {
    chrome.contextMenus.create({
      id,
      title: chrome.i18n.getMessage(messageKey) || fallback,
      contexts: ['page']
    });
  }

  // Materialize defaults so the options page shows real values on first run.
  await chrome.storage.sync.set(await loadSettings());
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab && CONTEXT_MENU_ITEMS.some((item) => item.id === info.menuItemId)) {
    handleCapture(tab, { mode: modeForCommand(info.menuItemId) }).catch(reportError);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (tab) {
    handleCapture(tab, { mode: modeForCommand(command) }).catch(reportError);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    captureActiveTab(request.options)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep the channel open for the async response.
  }

  // The content script cannot call chrome.tabs.captureVisibleTab itself.
  if (request.action === 'captureVisibleTab') {
    captureVisibleTab(sender.tab?.windowId ?? null)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }

  return false;
});

// Delays are timed with alarms rather than setTimeout: a service worker can be
// suspended long before a 10 second timer would fire.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== DELAYED_CAPTURE_ALARM) return;

  try {
    const stored = await chrome.storage.local.get(DELAYED_CAPTURE_KEY);
    const pending = stored[DELAYED_CAPTURE_KEY];
    await chrome.storage.local.remove(DELAYED_CAPTURE_KEY);
    if (!pending) return;

    const tab = await chrome.tabs.get(pending.tabId).catch(() => null);
    if (tab) await executeCapture(tab, pending.options);
  } catch (error) {
    console.error('Delayed capture error:', error);
  }
});

/* ------------------------------------------------------------ orchestration -- */

function modeForCommand(commandId) {
  return commandId === 'capture-selection' ? 'selection' : 'fullPage';
}

function reportError(error) {
  console.error('Capture error:', error);
}

/** A capture that fails after the popup has closed has nowhere to show itself,
 *  so surface it on the toolbar icon instead. */
function showCaptureError(error) {
  const detail = error?.message || String(error);
  const explanation = RESTRICTED_PAGE_PATTERN.test(detail)
    ? chrome.i18n.getMessage('errRestrictedPage')
    : detail;

  console.error('Capture failed:', error);
  chrome.action.setBadgeText({ text: ERROR_BADGE });
  chrome.action.setBadgeBackgroundColor({ color: ERROR_BADGE_COLOR });
  chrome.action.setTitle({ title: `${chrome.i18n.getMessage('errBadgeTitle')}\n${explanation}` });
}

function clearCaptureError() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: chrome.i18n.getMessage('extName') });
}

async function captureActiveTab(options) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');
  return handleCapture(tab, options);
}

/** Merge the request with stored defaults, then capture now or on a delay. */
async function handleCapture(tab, options) {
  const settings = await loadSettings();

  const captureOptions = {
    format: options.format || settings.defaultFormat,
    jpegQuality: settings.jpegQuality,
    saveDownload: options.saveDownload ?? settings.defaultSaveDownload,
    saveClipboard: options.saveClipboard ?? settings.defaultSaveClipboard,
    filePrefix: settings.filePrefix,
    mode: options.mode || 'fullPage',
    delaySeconds: options.delaySeconds || 0
  };

  if (captureOptions.mode === 'delay' && captureOptions.delaySeconds > 0) {
    return scheduleDelayedCapture(tab, captureOptions, options.delayMode || 'visible');
  }

  return executeCapture(tab, captureOptions);
}

async function scheduleDelayedCapture(tab, captureOptions, delayMode) {
  await chrome.storage.local.set({
    [DELAYED_CAPTURE_KEY]: {
      tabId: tab.id,
      options: {
        ...captureOptions,
        mode: delayMode === 'fullPage' ? 'fullPage' : 'visible',
        delaySeconds: 0
      }
    }
  });

  await chrome.alarms.create(DELAYED_CAPTURE_ALARM, {
    when: Date.now() + captureOptions.delaySeconds * 1000
  });

  return { success: true, delayed: true };
}

/** Produce the image for `mode` and hand it to the editor. */
async function executeCapture(tab, captureOptions) {
  if (captureInProgress) {
    console.log('Capture already in progress, skipping');
    return { success: false, error: 'Capture in progress' };
  }
  captureInProgress = true;
  clearCaptureError();

  try {
    const imageData = await captureImage(tab, captureOptions);
    if (imageData === null) {
      return { success: false, canceled: true };
    }

    await openEditor(tab, imageData, captureOptions);
    return { success: true };
  } catch (error) {
    showCaptureError(error);
    throw error;
  } finally {
    captureInProgress = false;
  }
}

/** @returns {Promise<string|null>} data URL, or null when the user canceled. */
async function captureImage(tab, { mode }) {
  if (mode === 'selection') {
    return captureSelection(tab);
  }

  if (mode === 'visible') {
    // Delayed visible capture: no scrolling, so open dropdowns stay open.
    await primeVisibleContent(tab.id).catch((error) => {
      console.warn('Visible-area priming failed:', error);
    });
    return captureTab(tab);
  }

  try {
    return await captureFullPage(tab);
  } catch (error) {
    console.error('Full page capture failed, falling back to visible area:', error);
    return captureTab(tab);
  }
}

/** Stash the image for the editor tab to pick up, then open it next to the source tab. */
async function openEditor(tab, imageData, captureOptions) {
  await chrome.storage.local.set({ pendingImage: imageData, captureOptions });
  await chrome.tabs.create({
    url: chrome.runtime.getURL('editor/editor.html'),
    index: tab.index + 1
  });
}
