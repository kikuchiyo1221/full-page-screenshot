// Drives a headless Chrome over CDP to check the extension end to end.
// Started by run.sh, which owns the browser process. Exits non-zero on failure.

import { cp, readFile, writeFile, mkdir } from 'node:fs/promises';
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

console.log('\n[1/2] shipped extension');
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
  note(errorsFor(swSession).length === 0, `service worker has no errors ${errorsFor(swSession).join(' | ')}`);
}

/* ----------------------------------------- phase 2: real capture behaviour -- */

console.log('\n[2/2] full-page capture against a 3000px fixture');
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

/* ------------------------------------------------------------------ result -- */

ws.close();
server.close();

console.log(`\n${failures.length ? `FAILED (${failures.length})` : 'ALL E2E CHECKS PASSED'}`);
process.exit(failures.length ? 1 : 0);
