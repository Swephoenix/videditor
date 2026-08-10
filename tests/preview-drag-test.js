const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
window.CSS = window.CSS || {}; window.CSS.escape = (s) => s;
window.alert = (m) => { throw new Error('ALERT: ' + m); };
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(v) { this._files = v; }
});

let mediaPosts = 0;
const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    mediaPosts += 1;
    return makeResponse({ id: 'img' + mediaPosts, name: 'bild.png', kind: 'image', hasVideo: true, width: 800, height: 600, duration: 0 });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

function importImage() {
  const input = document.querySelector('#media-input');
  input.files = [{ name: 'bild.png' }];
  input.dispatchEvent(new window.Event('change'));
}

function scrubTo(seconds) {
  const timeline = document.querySelector('#timeline-tracks');
  const x = seconds * 40;
  const rect = { left: 0, top: 0, width: 2000, height: 100, bottom: 100, right: 2000 };
  timeline.getBoundingClientRect = () => rect;
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: 10, bubbles: true }));
}

function readPos(el) {
  return { left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 };
}

setTimeout(() => {
  try {
    importImage();
    setTimeout(() => {
      // Bilden är vald och aktiv vid t=0. Centrerad position som referens.
      const imagePreview = document.querySelector('#image-preview');
      const before = readPos(imagePreview);
      console.log('Centrerad position:', JSON.stringify(before), '(referens)');

      // Dra bilden 100px höger och 50px ner i preview-fönstret (800x600 mock-storlek).
      const frame = { left: 0, top: 0, width: 800, height: 600, bottom: 600, right: 800 };
      const previewWindow = document.querySelector('.preview-window');
      previewWindow.getBoundingClientRect = () => frame;
      Object.defineProperty(previewWindow, 'clientWidth', { configurable: true, value: 800 });
      Object.defineProperty(previewWindow, 'clientHeight', { configurable: true, value: 600 });
      imagePreview.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: 400, clientY: 300, pointerId: 7, bubbles: true }));
      document.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 500, clientY: 350, pointerId: 7, bubbles: true }));
      document.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 500, clientY: 350, pointerId: 7, bubbles: true }));

      const after = readPos(imagePreview);
      console.log('Efter drag:', JSON.stringify(after));
      const dx = after.left - before.left;
      const dy = after.top - before.top;
      console.log('Förflyttning:', dx, dy, '(expect ~100, ~50)');
      if (Math.abs(dx - 100) > 1 || Math.abs(dy - 50) > 1) {
        throw new Error(`Draget förflyttade inte bilden rätt: ${dx}, ${dy}`);
      }

      // Dra tillbaka kanten och verifiera att positionen sparas/återställs vid scrub.
      scrubTo(1);
      setTimeout(() => {
        const afterScrub = readPos(imagePreview);
        console.log('Efter scrub till t=1:', JSON.stringify(afterScrub));
        if (Math.abs(afterScrub.left - after.left) > 1 || Math.abs(afterScrub.top - after.top) > 1) {
          throw new Error('Positionen tappades vid omrendering.');
        }
        console.log('DONE');
        process.exit(0);
      }, 150);
    }, 250);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
