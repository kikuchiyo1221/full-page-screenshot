// Shared i18n helpers for popup, options and editor pages.

export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

/** Fill every `[data-i18n]` element's text with its localized message. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    const message = t(element.dataset.i18n);
    if (message) {
      element.textContent = message;
    }
  });
}

/** Localize `option` elements carrying a data-i18n-value attribute inside a `select`. */
export function applyI18nToOptions(select) {
  if (!select) return;
  select.querySelectorAll('option[data-i18n-value]').forEach((option) => {
    const message = t(option.dataset.i18nValue);
    if (message) {
      option.textContent = message;
    }
  });
}
