// Popup: choose a capture mode and hand the request to the service worker.

import { applyI18n, applyI18nToOptions, t } from '../lib/i18n.js';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/settings.js';

/** Give the message a moment to reach the worker before the popup tears down. */
const CLOSE_DELAY_MS = 50;

function localize() {
  applyI18n();

  document.querySelectorAll('#delay-seconds option').forEach((option) => {
    option.textContent = t('delaySeconds', [option.value]) || `${option.value}s`;
  });
  applyI18nToOptions(document.getElementById('delay-mode'));
}

async function restoreDefaults() {
  const settings = await loadSettings();

  const formatRadio = document.querySelector(`input[name="format"][value="${settings.defaultFormat}"]`);
  if (formatRadio) formatRadio.checked = true;

  document.getElementById('save-download').checked = settings.defaultSaveDownload;
  document.getElementById('save-clipboard').checked = settings.defaultSaveClipboard;
}

function readCaptureOptions() {
  return {
    format: document.querySelector('input[name="format"]:checked')?.value
      || DEFAULT_SETTINGS.defaultFormat,
    saveDownload: document.getElementById('save-download').checked,
    saveClipboard: document.getElementById('save-clipboard').checked,
    delaySeconds: parseInt(document.getElementById('delay-seconds').value, 10)
  };
}

async function requestCapture(mode, extraOptions = {}) {
  try {
    await chrome.runtime.sendMessage({
      action: 'capture',
      options: { ...readCaptureOptions(), ...extraOptions, mode }
    });
  } catch (error) {
    // The capture continues in the background even if the popup loses the port.
    console.warn('Capture request failed:', error);
  }

  setTimeout(() => window.close(), CLOSE_DELAY_MS);
}

document.addEventListener('DOMContentLoaded', async () => {
  localize();
  await restoreDefaults();

  document.getElementById('btn-full-page')
    .addEventListener('click', () => requestCapture('fullPage'));

  document.getElementById('btn-selection')
    .addEventListener('click', () => requestCapture('selection'));

  document.getElementById('btn-delay').addEventListener('click', () => {
    requestCapture('delay', {
      delaySeconds: parseInt(document.getElementById('delay-seconds').value, 10),
      delayMode: document.getElementById('delay-mode').value
    });
  });

  document.getElementById('open-settings').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
