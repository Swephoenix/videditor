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

const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    return makeResponse({ id: 'v1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

const timeline = document.querySelector('#timeline-tracks');
const scroll = document.querySelector('#timeline-scroll');

function scrubTo(seconds) {
  timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 8000, height: 200, bottom: 200, right: 8000 });
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: seconds * 40, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: seconds * 40, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: seconds * 40, clientY: 10, bubbles: true }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

setTimeout(() => {
  (async () => {
    try {
      Object.defineProperty(scroll, 'clientWidth', { configurable: true, get: () => 500 });
      Object.defineProperty(scroll, 'scrollWidth', { configurable: true, get: () => 8000 });
      scroll.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 200, right: 500, bottom: 200 });
      scroll.scrollLeft = 0;

      // Playhead långt till höger (t.ex. vid 100s = 4000px) – vyn ska följa.
      scrubTo(100);
      await wait(60);
      console.log('Scroll efter hopp till 100s:', scroll.scrollLeft, 'px (expect ~3600)');
      if (scroll.scrollLeft < 3500) throw new Error('Vyn följde inte playhead till höger.');

      // Playhead till vänster igen – vyn ska röra sig tillbaka.
      scrubTo(1);
      await wait(60);
      console.log('Scroll efter hopp till 1s:', scroll.scrollLeft, 'px (expect 0)');
      if (scroll.scrollLeft !== 0) throw new Error('Vyn följde inte playhead till vänster.');

      // Inom synlig vy – ingen onödig scrollning.
      scrubTo(6);
      await wait(60);
      console.log('Scroll efter hopp till 6s (inom vy):', scroll.scrollLeft, 'px (expect 0)');
      if (scroll.scrollLeft !== 0) throw new Error('Vyn scrollade trots att playhead är synlig.');

      console.log('DONE');
      process.exit(0);
    } catch (e) {
      console.log('TEST ERROR:', e.message, e.stack);
      process.exit(1);
    }
  })();
}, 100);
