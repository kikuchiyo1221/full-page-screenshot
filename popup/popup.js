// Initialize i18n
function initI18n() {
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });

  // Update delay select options
  const delaySelect = document.getElementById('delay-seconds');
  delaySelect.querySelectorAll('option').forEach(option => {
    const seconds = option.value;
    option.textContent = chrome.i18n.getMessage('delaySeconds', [seconds]) || `${seconds}s`;
  });

  // Update delay mode select options
  const delayModeSelect = document.getElementById('delay-mode');
  delayModeSelect.querySelectorAll('option').forEach(option => {
    const key = option.getAttribute('data-i18n-value');
    if (key) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        option.textContent = message;
      }
    }
  });
}

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    defaultFormat: 'png',
    defaultSaveDownload: true,
    defaultSaveClipboard: false
  });

  // Apply format
  const formatRadio = document.querySelector(`input[name="format"][value="${settings.defaultFormat}"]`);
  if (formatRadio) {
    formatRadio.checked = true;
  }

  // Apply save options
  document.getElementById('save-download').checked = settings.defaultSaveDownload;
  document.getElementById('save-clipboard').checked = settings.defaultSaveClipboard;
}

// Show status message
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      statusEl.classList.add('hidden');
    }, 3000);
  }
}

// Get capture options
function getCaptureOptions() {
  const format = document.querySelector('input[name="format"]:checked').value;
  const saveDownload = document.getElementById('save-download').checked;
  const saveClipboard = document.getElementById('save-clipboard').checked;
  const delaySeconds = parseInt(document.getElementById('delay-seconds').value);

  return {
    format,
    saveDownload,
    saveClipboard,
    delaySeconds
  };
}

// Send capture command to background script
async function sendCaptureCommand(mode, options = {}) {
  const captureOptions = {
    ...getCaptureOptions(),
    ...options,
    mode
  };

  // Send message and wait for acknowledgment before closing
  // This prevents race condition where popup closes before message is sent
  try {
    await chrome.runtime.sendMessage({
      action: 'capture',
      options: captureOptions
    });
  } catch (e) {
    // Ignore errors - capture will proceed in background
  }

  // Small delay to ensure message is fully processed
  setTimeout(() => window.close(), 50);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  await loadSettings();

  // Full page capture
  document.getElementById('btn-full-page').addEventListener('click', () => {
    sendCaptureCommand('fullPage');
  });

  // Selection capture
  document.getElementById('btn-selection').addEventListener('click', () => {
    sendCaptureCommand('selection');
  });

  // Delayed capture
  document.getElementById('btn-delay').addEventListener('click', () => {
    const delaySeconds = parseInt(document.getElementById('delay-seconds').value);
    const delayMode = document.getElementById('delay-mode').value;
    sendCaptureCommand('delay', { delaySeconds, delayMode });
  });

  // Open settings
  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
