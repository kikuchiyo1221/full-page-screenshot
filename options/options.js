// Options page: edit and persist the extension's default settings.

import { applyI18n, t } from '../lib/i18n.js';
import { buildFilename } from '../lib/filename.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/settings.js';

const SHORTCUTS_URL = 'chrome://extensions/shortcuts';
const SAVE_STATUS_TIMEOUT_MS = 3000;

const fields = {
  format: () => document.getElementById('default-format'),
  quality: () => document.getElementById('jpeg-quality'),
  qualityValue: () => document.getElementById('jpeg-quality-value'),
  saveDownload: () => document.getElementById('save-download'),
  saveClipboard: () => document.getElementById('save-clipboard'),
  prefix: () => document.getElementById('file-prefix')
};

async function restoreSettings() {
  const settings = await loadSettings();

  fields.format().value = settings.defaultFormat;
  fields.quality().value = settings.jpegQuality;
  fields.qualityValue().textContent = `${settings.jpegQuality}%`;
  fields.saveDownload().checked = settings.defaultSaveDownload;
  fields.saveClipboard().checked = settings.defaultSaveClipboard;
  fields.prefix().value = settings.filePrefix;

  updateFilenamePreview();
}

async function persistSettings() {
  await saveSettings({
    defaultFormat: fields.format().value,
    jpegQuality: parseInt(fields.quality().value, 10),
    defaultSaveDownload: fields.saveDownload().checked,
    defaultSaveClipboard: fields.saveClipboard().checked,
    filePrefix: fields.prefix().value.trim() || DEFAULT_SETTINGS.filePrefix
  });

  const status = document.getElementById('save-status');
  status.textContent = t('msgSettingsSaved') || 'Settings saved';
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), SAVE_STATUS_TIMEOUT_MS);
}

function updateFilenamePreview() {
  document.getElementById('filename-preview').textContent = buildFilename({
    prefix: fields.prefix().value,
    format: fields.format().value
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  await restoreSettings();

  fields.quality().addEventListener('input', (event) => {
    fields.qualityValue().textContent = `${event.target.value}%`;
  });

  fields.prefix().addEventListener('input', updateFilenamePreview);
  fields.format().addEventListener('change', updateFilenamePreview);

  document.getElementById('btn-save').addEventListener('click', persistSettings);

  document.getElementById('open-shortcuts').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: SHORTCUTS_URL });
  });
});
