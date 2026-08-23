// Drives a headless Chrome over CDP to check the extension end to end.
// Started by run.sh, which owns the browser process. Exits non-zero on failure.

import { cp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const EXT_ROOT = process.env.EXT_ROOT;
const WORK_DIR = process.env.WORK_DIR;
const CDP_PORT = process.env.CDP_PORT || '9333';

const BANDS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
const BAND_HEIGHT = 500;
const PAGE_HEIGHT = BANDS.length * BAND_HEIGHT;

const failures = [];
const note = (ok, message) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ fixture host -- */

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const file = join(import.meta.dirname, 'fixtures', req.url === '/' ? '/tall.html' : req.url);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const FIXTURE_URL = `http://127.0.0.1:${server.address().port}/tall.html`;

/* -------------------------------------------------------------- cdp client -- */

const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push({ sessionId: msg.sessionId, text: msg.params.entry.text });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const details = msg.params.exceptionDetails;
    consoleErrors.push({ sessionId: msg.sessionId, text: details.exception?.description || details.text });
  }
};

const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  setTimeout(() => {
    if (pending.delete(id)) reject(new Error(`${method} timed out`));
  }, 120000);
});

async function openPage(url) {
  const { targetId } = await send('Target.createTarget', { url });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  await sleep(1500);
  return { targetId, sessionId };
}

async function evaluate(sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

const errorsFor = (sessionId) => consoleErrors.filter((e) => e.sessionId === sessionId).map((e) => e.text);

const rectOf = async (sessionId, selector) => JSON.parse(await evaluate(
  sessionId,
  `JSON.stringify((({ x, y, width, height }) => ({ x, y, width, height }))(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()))`
));

const mouse = (sessionId, type, x, y, buttons) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons }, sessionId);

async function click(sessionId, selector) {
  await evaluate(sessionId, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', inline: 'center' })`);
  const box = await rectOf(sessionId, selector);
  const view = JSON.parse(await evaluate(sessionId, 'JSON.stringify({ w: innerWidth, h: innerHeight })'));

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (box.width === 0 || x < 0 || y < 0 || x > view.w || y > view.h) {
    throw new Error(`${selector} is not on screen: (${Math.round(x)}, ${Math.round(y)}) in ${view.w}x${view.h}`);
  }

  await mouse(sessionId, 'mousePressed', x, y, 1);
  await mouse(sessionId, 'mouseReleased', x, y, 0);
  await sleep(120);
}

/** Drag inside an element, in fractions of its own box. */
async function drag(sessionId, selector, from, to) {
  const box = await rectOf(sessionId, selector);
  const at = (p) => [box.x + box.width * p[0], box.y + box.height * p[1]];
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);

  await mouse(sessionId, 'mousePressed', x1, y1, 1);
  for (let step = 1; step <= 4; step += 1) {
    await mouse(sessionId, 'mouseMoved', x1 + (x2 - x1) * step / 4, y1 + (y2 - y1) * step / 4, 1);
  }
  await mouse(sessionId, 'mouseReleased', x2, y2, 0);
  await sleep(150);
}

async function serviceWorkerSession(extensionId) {
  await send('Target.setDiscoverTargets', { discover: true });
  await sleep(800);
  const { targetInfos } = await send('Target.getTargets', { filter: [{}] });
  const worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extensionId));
  if (!worker) return null;

  const { sessionId } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  await send('Log.enable', {}, sessionId);
  return sessionId;
}

/* ---------------------------------------------- phase 1: the shipped build -- */

console.log('\n[1/4] shipped extension');
const { id: shippedId } = await send('Extensions.loadUnpacked', { path: EXT_ROOT });

for (const [name, path, probe] of [
  ['popup', 'popup/popup.html', `document.querySelectorAll('.capture-btn').length`],
  ['options', 'options/options.html', `document.getElementById('filename-preview').textContent.length`],
  ['editor', 'editor/editor.html', `document.querySelectorAll('.tool-btn[data-tool]').length`]
]) {
  const { sessionId } = await openPage(`chrome-extension://${shippedId}/${path}`);
  const value = await evaluate(sessionId, probe);
  note(value > 0, `${name} page renders (probe=${value})`);
  note(errorsFor(sessionId).length === 0, `${name} page has no console errors ${errorsFor(sessionId).join(' | ')}`);
  if (name === 'popup') {
    await evaluate(sessionId, `new Promise(r => chrome.runtime.sendMessage({action:'__wake'}, () => { void chrome.runtime.lastError; r(1); }))`);
  }
}

const swSession = await serviceWorkerSession(shippedId);
note(Boolean(swSession), 'service worker starts');

if (swSession) {
  const manifest = JSON.parse(await evaluate(swSession, 'JSON.stringify(chrome.runtime.getManifest())'));
  note(!manifest.permissions.includes('debugger'), 'no "debugger" permission (Web Store rejection cause)');
  note(!manifest.host_permissions, 'no host_permissions');
  note(!manifest.content_scripts, 'no declarative content_scripts');
  note(!manifest.web_accessible_resources, 'no web_accessible_resources');
  note(
    await evaluate(swSession, 'chrome.runtime.onMessage.hasListeners() && chrome.alarms.onAlarm.hasListeners() && chrome.commands.onCommand.hasListeners() && chrome.contextMenus.onClicked.hasListeners()'),
    'every entry-point listener is wired'
  );
  // Without the permission the API is not even exposed, so the "this browser is
  // being debugged" bar can never appear.
  note(
    await evaluate(swSession, `typeof chrome.debugger === 'undefined'`),
    'chrome.debugger API is not available to the extension'
  );
  note(errorsFor(swSession).length === 0, `service worker has no errors ${errorsFor(swSession).join(' | ')}`);
}

// What Chrome itself tells the user on the extension's detail page. This is the
// wording a Web Store reviewer and every installer sees, so assert it directly
// rather than inferring it from the manifest.
{
  const { sessionId } = await openPage(`chrome://extensions/?id=${shippedId}`);
  const detailText = await evaluate(sessionId, `(() => {
    const found = [];
    const walk = (root, depth) => {
      if (depth > 8) return;
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) walk(element.shadowRoot, depth + 1);
      }
      if (root.host?.tagName === 'EXTENSIONS-DETAIL-VIEW') {
        found.push(root.textContent.replace(/\\s+/g, ' ').trim());
      }
    };
    walk(document, 0);
    return found.join(' ');
  })()`);

  note(detailText.includes('no additional site access'), 'Chrome reports "no additional site access"');
  note(detailText.includes('Manage your downloads'), 'the only permission warning is "Manage your downloads"');
  note(!detailText.includes('Read and change all your data'), 'no "read and change all your data" warning');
  note(!detailText.includes('Read your browsing history'), 'no "read your browsing history" warning');
}

/* ----------------------------------------- phase 2: real capture behaviour -- */

console.log('\n[2/4] full-page capture against a 3000px fixture');
const testBuild = join(WORK_DIR, 'ext-with-host-permissions');
await mkdir(testBuild, { recursive: true });
await cp(EXT_ROOT, testBuild, {
  recursive: true,
  filter: (src) => !/\/(\.git|node_modules|store-assets|docs)(\/|$)/.test(src)
});
const testManifest = JSON.parse(await readFile(join(testBuild, 'manifest.json'), 'utf8'));
testManifest.host_permissions = ['<all_urls>']; // stands in for a user gesture; not shipped
await writeFile(join(testBuild, 'manifest.json'), JSON.stringify(testManifest, null, 2));

const { id: testId } = await send('Extensions.loadUnpacked', { path: testBuild });

const target = await send('Target.createTarget', { url: FIXTURE_URL });
await sleep(1200);
const driver = await openPage(`chrome-extension://${testId}/options/options.html`);
await send('Target.activateTarget', { targetId: target.targetId }); // the tab to capture must be active
await sleep(500);

const captureResult = await evaluate(driver.sessionId, `Promise.race([
  chrome.runtime.sendMessage({ action: 'capture', options: { mode: 'fullPage', format: 'png' } }),
  new Promise(r => setTimeout(() => r({ timedOut: true }), 90000))
])`);
note(captureResult?.success === true, `capture completed (${JSON.stringify(captureResult)})`);

const report = await evaluate(driver.sessionId, `(async () => {
  const { pendingImage } = await chrome.storage.local.get('pendingImage');
  if (!pendingImage) return { error: 'nothing handed to the editor' };

  const bitmap = await createImageBitmap(await (await fetch(pendingImage)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  // Sample away from the centre: the fixture draws a large digit there.
  const at = (y) => {
    const d = ctx.getImageData(Math.floor(bitmap.width * 0.06), y, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  };

  const samples = { top: at(2), bottom: at(bitmap.height - 3), centres: [], seams: [] };
  for (let i = 0; i < ${BANDS.length}; i++) samples.centres.push(at(i * ${BAND_HEIGHT} + ${BAND_HEIGHT / 2}));
  for (let i = 1; i < ${BANDS.length}; i++) {
    samples.seams.push([at(i * ${BAND_HEIGHT} - 3), at(i * ${BAND_HEIGHT} + 3)]);
  }
  return { width: bitmap.width, height: bitmap.height, samples };
})()`);

if (report.error) {
  note(false, report.error);
} else {
  note(report.height === PAGE_HEIGHT, `stitched height is ${report.height}px (expected ${PAGE_HEIGHT})`);
  note(report.samples.top === BANDS[0], `sticky header excluded (top row ${report.samples.top})`);
  note(report.samples.bottom === BANDS.at(-1), `page bottom reached (last row ${report.samples.bottom})`);

  const wrongBand = report.samples.centres.findIndex((colour, i) => colour !== BANDS[i]);
  note(wrongBand === -1, wrongBand === -1
    ? `all ${BANDS.length} bands land at the right offset`
    : `band ${wrongBand + 1} is ${report.samples.centres[wrongBand]}, expected ${BANDS[wrongBand]}`);

  const badSeam = report.samples.seams.findIndex(([above, below], i) => above !== BANDS[i] || below !== BANDS[i + 1]);
  note(badSeam === -1, badSeam === -1
    ? `no gaps or duplication at any of the ${BANDS.length - 1} chunk seams`
    : `seam ${badSeam + 1} reads ${report.samples.seams[badSeam].join(' / ')} — stitch drift`);
}

/* ------------------------------------------- phase 3: selection capture ----- */
// The overlay is injected on demand now that the manifest declares no content
// scripts, so this exercises injection -> drag -> crop -> handoff end to end.

console.log('\n[3/4] selection capture (on-demand overlay injection)');
{
  const SELECTION_URL = FIXTURE_URL.replace('tall.html', 'plain.html');
  const target = await send('Target.createTarget', { url: SELECTION_URL });
  const pageSession = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
  await send('Runtime.enable', {}, pageSession);
  await send('Log.enable', {}, pageSession);
  await sleep(1000);

  const driver = await openPage(`chrome-extension://${testId}/options/options.html`);
  await send('Target.activateTarget', { targetId: target.targetId });
  await sleep(400);
  await evaluate(driver.sessionId, `chrome.storage.local.remove('pendingImage')`);

  // Fire without awaiting: the capture only settles once the drag finishes.
  await send('Runtime.evaluate', {
    expression: `window.__capture = chrome.runtime.sendMessage({ action: 'capture', options: { mode: 'selection' } }); 1`,
    returnByValue: true
  }, driver.sessionId);
  await sleep(2500);

  const overlay = await evaluate(pageSession, `(() => {
    const element = document.getElementById('screenshot-selection-overlay');
    if (!element) return { present: false };
    const style = getComputedStyle(element);
    return {
      present: true,
      styled: style.position === 'fixed' && style.cursor === 'crosshair',
      boxes: element.querySelectorAll('.screenshot-selection-box').length
    };
  })()`);

  note(overlay.present, 'the overlay is injected into the page');
  note(overlay.styled === true, 'content.css was injected with it');
  note(overlay.boxes === 1, 'the selection box exists');

  if (overlay.present) {
    const drawFrom = [150, 150];
    const drawTo = [600, 450];
    const point = (type, [x, y], buttons) =>
      send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons }, pageSession);

    await point('mousePressed', drawFrom, 1);
    for (let step = 1; step <= 5; step += 1) {
      await point('mouseMoved', [
        drawFrom[0] + ((drawTo[0] - drawFrom[0]) * step) / 5,
        drawFrom[1] + ((drawTo[1] - drawFrom[1]) * step) / 5
      ], 1);
    }
    await point('mouseReleased', drawTo, 0);

    const outcome = await evaluate(driver.sessionId, `Promise.race([
      window.__capture,
      new Promise(r => setTimeout(() => r({ timedOut: true }), 30000))
    ])`);
    note(outcome?.success === true, `selection capture completed (${JSON.stringify(outcome)})`);

    const cropped = await evaluate(driver.sessionId, `(async () => {
      const { pendingImage } = await chrome.storage.local.get('pendingImage');
      if (!pendingImage) return { image: false };
      const bitmap = await createImageBitmap(await (await fetch(pendingImage)).blob());
      return { image: true, width: bitmap.width, height: bitmap.height };
    })()`);

    note(cropped.image === true, 'a cropped image reached the editor');
    if (cropped.image) {
      // The selection box border adds a couple of pixels on each side.
      const closeEnough = Math.abs(cropped.width - 450) <= 8 && Math.abs(cropped.height - 300) <= 8;
      note(closeEnough, `crop matches the dragged region (${cropped.width}x${cropped.height}, dragged 450x300)`);
    }
  }

  await send('Target.closeTarget', { targetId: target.targetId });
}

// A capture that fails after the popup has closed must still tell the user
// something. chrome:// pages are unscriptable for every extension, so this is a
// reliable way to provoke the failure path.
{
  const restricted = await send('Target.createTarget', { url: 'chrome://version' });
  await sleep(800);

  // Open the driver FIRST: creating a target makes it active, which would make
  // the extension capture the driver page instead of the restricted one.
  const driver = await openPage(`chrome-extension://${testId}/options/options.html`);
  await send('Target.activateTarget', { targetId: restricted.targetId });
  await sleep(500);

  await evaluate(driver.sessionId, `chrome.runtime.sendMessage({ action: 'capture', options: { mode: 'fullPage' } }).catch(() => null)`);
  await sleep(1200);

  const badge = await evaluate(driver.sessionId, `chrome.action.getBadgeText({})`);
  const title = await evaluate(driver.sessionId, `chrome.action.getTitle({})`);

  note(badge === '!', `a failed capture marks the toolbar icon (badge: ${JSON.stringify(badge)})`);
  note(/cannot be captured/i.test(title), `the tooltip explains why (${JSON.stringify(title)})`);

  await send('Target.closeTarget', { targetId: restricted.targetId });
}

/* ------------------------------------- phase 4: the editor, driven by input -- */

console.log('\n[4/4] editor: drawing, undo/redo and export');

const DOWNLOAD_DIR = join(WORK_DIR, 'downloads');
await mkdir(DOWNLOAD_DIR, { recursive: true });
await send('Browser.grantPermissions', {
  origin: `chrome-extension://${shippedId}`,
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
}).catch(() => {});

// Hand the editor a blank 400x300 canvas to annotate.
const stager = await openPage(`chrome-extension://${shippedId}/options/options.html`);
await evaluate(stager.sessionId, `(async () => {
  const canvas = new OffscreenCanvas(400, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 300);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  await chrome.storage.local.set({ pendingImage: dataUrl, captureOptions: { format: 'png' } });
})()`);

const editor = await openPage(`chrome-extension://${shippedId}/editor/editor.html`);

// Number of pixels the annotation layer has actually painted.
const inkedPixels = () => evaluate(editor.sessionId, `(() => {
  const canvas = document.getElementById('drawing-canvas');
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
  return painted;
})()`);

note(await inkedPixels() === 0, 'annotation layer starts empty');

await click(editor.sessionId, '.tool-btn[data-tool="rect"]');
note(
  await evaluate(editor.sessionId, `document.querySelector('.tool-btn[data-tool="rect"]').classList.contains('active')`),
  'selecting a tool marks it active'
);

await drag(editor.sessionId, '#drawing-canvas', [0.2, 0.25], [0.75, 0.7]);
const afterDraw = await inkedPixels();
note(afterDraw > 0, `dragging draws a rectangle (${afterDraw} px painted)`);

await click(editor.sessionId, '#btn-undo');
note(await inkedPixels() === 0, 'undo clears the annotation');

await click(editor.sessionId, '#btn-redo');
note(await inkedPixels() === afterDraw, 'redo restores it exactly');

// Exports. chrome.downloads writes into the throwaway profile's download dir.
const downloadedNames = async () => (await readdir(DOWNLOAD_DIR)).filter((f) => !f.endsWith('.crdownload'));

for (const [format, extensions, magic] of [
  ['png', ['.png'], '\x89PNG'],
  ['jpeg', ['.jpg', '.jpeg'], '\xff\xd8'],
  ['pdf', ['.pdf'], '%PDF']
]) {
  await evaluate(editor.sessionId, `document.getElementById('format-select').value = ${JSON.stringify(format)}`);
  await click(editor.sessionId, '#btn-save');

  let file = null;
  for (let attempt = 0; attempt < 25 && !file; attempt += 1) {
    await sleep(400);
    file = (await downloadedNames()).find((name) => extensions.some((ext) => name.endsWith(ext)));
  }

  if (!file) {
    note(false, `${format}: no ${extensions.join('/')} file was written`);
    continue;
  }

  const head = (await readFile(join(DOWNLOAD_DIR, file))).subarray(0, 4).toString('latin1');
  note(head.startsWith(magic), `${format}: ${file} written with the right file signature`);
  note(/^screenshot_\d{8}_\d{6}\./.test(file), `${format}: filename follows the configured pattern (${file})`);
}

const copyResult = await evaluate(editor.sessionId, `(async () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 8; canvas.height = 8;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'ok';
  } catch (error) {
    return String(error.name || error);
  }
})()`);
console.log(`  info clipboard write in headless: ${copyResult}${copyResult === 'ok' ? '' : ' (verify by hand — headless has no focused window)'}`);

note(errorsFor(editor.sessionId).length === 0, `editor logged no errors ${errorsFor(editor.sessionId).join(' | ')}`);

/* ------------------------------------------------------------------ result -- */

ws.close();
server.close();

console.log(`\n${failures.length ? `FAILED (${failures.length})` : 'ALL E2E CHECKS PASSED'}`);
process.exit(failures.length ? 1 : 0);
