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
  try {
    // Disable all buttons during capture
    document.querySelectorAll('.capture-btn').forEach(btn => {
      btn.disabled = true;
    });

    showStatus(chrome.i18n.getMessage('msgCapturing') || 'Capturing...', 'info');

    const captureOptions = {
      ...getCaptureOptions(),
      ...options,
      mode
    };

    const response = await chrome.runtime.sendMessage({
      action: 'capture',
      options: captureOptions
    });

    if (response.success) {
      showStatus(chrome.i18n.getMessage('msgCaptureComplete') || 'Capture complete', 'success');
      // Close popup after successful capture
      setTimeout(() => window.close(), 1000);
    } else {
      throw new Error(response.error || 'Capture failed');
    }
  } catch (error) {
    console.error('Capture error:', error);
    showStatus(error.message, 'error');
  } finally {
    document.querySelectorAll('.capture-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
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
