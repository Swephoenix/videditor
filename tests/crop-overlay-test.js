const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = '/mnt/games/home-relocated/Downloads/videditor';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.CSS = window.CSS || {}; window.CSS.escape = (s) => s;
window.alert = (m) => {};
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true, get() { return this._files || null; }, set(v) { this._files = v; }
});

// Mock layout dimensions for crop overlay and preview window
const pwEl = document.querySelector('.preview-window');
Object.defineProperty(pwEl, 'clientWidth', { configurable: true, get: () => 800 });
Object.defineProperty(pwEl, 'clientHeight', { configurable: true, get: () => 450 });
const overlayEl = document.querySelector('#crop-overlay');
Object.defineProperty(overlayEl, 'clientWidth', { configurable: true, get: () => 800 });
Object.defineProperty(overlayEl, 'clientHeight', { configurable: true, get: () => 450 });
overlayEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450, right: 800, bottom: 450 });

let mi = 0;
const mediaItems = [
  { id: 'vid1', name: 'video1.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 },
];
const makeResponse = (body) => ({
  ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') return makeResponse(mediaItems[mi++] || mediaItems[0]);
  if (url.includes('/extract-audio')) {
    return makeResponse({ id: 'aud1', name: 'extracted.m4a', kind: 'audio', hasAudio: true, duration: 10, storedName: 'x.m4a' });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message); process.exit(1); }

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  // Upload a video clip
  const videoInput = document.querySelector('#media-input');
  videoInput.files = [{ name: 'video1.mp4' }];
  videoInput.dispatchEvent(new window.Event('change'));
  await wait(300);

  const toggleBtn = document.querySelector('#qt-crop');
  const overlay = document.querySelector('#crop-overlay');
  const cropTools = document.querySelector('#crop-tools');
  const mask = document.querySelector('#crop-mask');
  const handles = [...document.querySelectorAll('.crop-handle')];

  let pass = 0;
  
  // Test 1: starts hidden
  if (overlay.hidden) pass += 1; else console.log('FAIL: overlay not hidden initially');
  if (cropTools.hidden) pass += 1; else console.log('FAIL: crop-tools not hidden initially');

  // Test 2: toggle on
  toggleBtn.dispatchEvent(new window.Event('click'));
  await wait(50);
  if (!overlay.hidden) pass += 1; else console.log('FAIL: overlay not visible');
  if (!cropTools.hidden) pass += 1; else console.log('FAIL: crop-tools not visible');
  const maskL = document.querySelector('#crop-mask-l');
  const maskR = document.querySelector('#crop-mask-r');
  const maskT = document.querySelector('#crop-mask-t');
  const maskB = document.querySelector('#crop-mask-b');
  if (maskL.style.cssText !== '') pass += 1; else console.log('FAIL: maskL not positioned');
  if (handles.length === 8) pass += 1; else console.log('FAIL: expected 8 handles got', handles.length);

  const positioned = handles.filter((h) => h.style.left !== '').length;
  if (positioned === 8) pass += 1; else console.log('FAIL: only', positioned, 'handles positioned');

  // Test 3: drag right handle
  const rightHandle = handles.find((h) => h.dataset.side === 'right');
  rightHandle.dispatchEvent(new window.PointerEvent('pointerdown', {
    pointerId: 1, clientX: 790, clientY: 225, bubbles: true
  }));
  document.dispatchEvent(new window.PointerEvent('pointermove', {
    pointerId: 1, clientX: 710, clientY: 225
  }));
  document.dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1 }));
  await wait(50);
  if (!overlay.hidden) pass += 1; else console.log('FAIL: overlay hidden after drag');
  if (maskR.style.width && parseFloat(maskR.style.width) > 0) pass += 1; else console.log('FAIL: maskR width not changed after drag, got:', maskR.style.width);

  // Test 4: cancel restores
  document.querySelector('#crop-cancel').dispatchEvent(new window.Event('click'));
  await wait(30);
  if (overlay.hidden) pass += 1; else console.log('FAIL: overlay visible after cancel');
  if (cropTools.hidden) pass += 1; else console.log('FAIL: crop-tools visible after cancel');

  // Test 5: re-enter, reset, done
  toggleBtn.dispatchEvent(new window.Event('click'));
  await wait(50);
  if (!overlay.hidden) pass += 1; else console.log('FAIL: overlay not visible on re-enter');
  document.querySelector('#reset-crop').dispatchEvent(new window.Event('click'));
  document.querySelector('#crop-done').dispatchEvent(new window.Event('click'));
  await wait(30);
  if (overlay.hidden) pass += 1; else console.log('FAIL: overlay not hidden after done');

  console.log(`${pass}/13 passed`);
  if (pass === 13) console.log('CROP OVERLAY OK');
  else process.exit(1);
})();
