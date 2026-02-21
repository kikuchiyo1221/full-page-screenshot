// Options Page Script

// Initialize i18n
function initI18n() {
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      elem.textContent = message;
    }
  });
}

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    defaultFormat: 'png',
    jpegQuality: 92,
    defaultSaveDownload: true,
    defaultSaveClipboard: false,
    filePrefix: 'screenshot'
  });

  document.getElementById('default-format').value = settings.defaultFormat;
  document.getElementById('jpeg-quality').value = settings.jpegQuality;
  document.getElementById('jpeg-quality-value').textContent = settings.jpegQuality + '%';
  document.getElementById('save-download').checked = settings.defaultSaveDownload;
  document.getElementById('save-clipboard').checked = settings.defaultSaveClipboard;
  document.getElementById('file-prefix').value = settings.filePrefix;

  updateFilenamePreview();
}

// Save settings
async function saveSettings() {
  const settings = {
    defaultFormat: document.getElementById('default-format').value,
    jpegQuality: parseInt(document.getElementById('jpeg-quality').value),
    defaultSaveDownload: document.getElementById('save-download').checked,
    defaultSaveClipboard: document.getElementById('save-clipboard').checked,
    filePrefix: document.getElementById('file-prefix').value.trim() || 'screenshot'
  };

  await chrome.storage.sync.set(settings);

  // Show save status
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = chrome.i18n.getMessage('msgSettingsSaved') || 'Settings saved';
  statusEl.classList.remove('hidden');

  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}

// Update filename preview
function updateFilenamePreview() {
  const prefix = document.getElementById('file-prefix').value.trim() || 'screenshot';
  const format = document.getElementById('default-format').value;
  const extension = format === 'jpeg' ? 'jpg' : format;
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .split('.')[0];

  document.getElementById('filename-preview').textContent = `${prefix}_${timestamp}.${extension}`;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  await loadSettings();

  // Quality slider
  const qualitySlider = document.getElementById('jpeg-quality');
  qualitySlider.addEventListener('input', (e) => {
    document.getElementById('jpeg-quality-value').textContent = e.target.value + '%';
  });

  // File prefix input
  const prefixInput = document.getElementById('file-prefix');
  prefixInput.addEventListener('input', updateFilenamePreview);

  // Format select
  document.getElementById('default-format').addEventListener('change', updateFilenamePreview);

  // Save button
  document.getElementById('btn-save').addEventListener('click', saveSettings);

  // Open shortcuts link
  document.getElementById('open-shortcuts').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});
