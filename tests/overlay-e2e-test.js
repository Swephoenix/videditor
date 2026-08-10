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
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
window.alert = () => {};
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true, get() { return this._files || null; }, set(v) { this._files = v; }
});

// Stub timeline geometry: PX_PER_SECOND=40. We'll set playhead via timeline mousedown+mousemove.
const segmentsWithWords = [
  { start: 0.0, end: 1.0, text: 'Hej alla', words: [
    { start: 0.0, end: 0.4, word: 'Hej' },
    { start: 0.4, end: 0.7, word: 'alla' },
  ]},
  { start: 1.0, end: 2.0, text: 'hur ar', words: [
    { start: 1.0, end: 1.5, word: 'hur' },
    { start: 1.5, end: 2.0, word: 'ar' },
  ]},
];

const makeResponse = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') return makeResponse({ id: 'vid1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 5 });
  if (url.includes('/transcribe') && opts && opts.method === 'POST') return makeResponse({ id: 'job1', status: 'queued' });
  if (url.includes('/api/transcribe/job1')) return makeResponse({ id: 'job1', status: 'completed', progress: 100, message: 'klar', segments: segmentsWithWords });
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

// Helper to set playhead by simulating timeline scrub at pixel x (40px/sec)
function scrubTo(seconds) {
  const timeline = document.querySelector('#timeline-tracks');
  const x = seconds * 40; // pixelsToSeconds = x/40, setPlayhead clamps to >=0
  const rect = { left: 0, top: 0, width: 2000, height: 100, bottom: 100, right: 2000 };
  timeline.getBoundingClientRect = () => rect;
  const down = new window.MouseEvent('mousedown', { clientX: x, clientY: 10, bubbles: true });
  timeline.dispatchEvent(down);
  const move = new window.MouseEvent('mousemove', { clientX: x, clientY: 10, bubbles: true });
  document.dispatchEvent(move);
  const up = new window.MouseEvent('mouseup', { clientX: x, clientY: 10, bubbles: true });
  document.dispatchEvent(up);
}

function overlayText() { return document.querySelector('#transcript-overlay').textContent; }

setTimeout(() => {
  const videoInput = document.querySelector('#media-input');
  videoInput.files = [{ name: 'v.mp4' }];
  videoInput.dispatchEvent(new window.Event('change'));
  setTimeout(() => {
    document.querySelector('#burn-transcription').checked = true;
    document.querySelector('#transcribe').dispatchEvent(new window.Event('click'));
    setTimeout(() => {
      // transcription done. Now scrub timeline to various times.
      const results = [];
      for (const t of [0.1, 0.5, 0.9, 1.2, 1.7, 2.5, -0.5]) {
        scrubTo(t);
        results.push(`t=${t} -> "${overlayText()}"`);
      }
      results.forEach(r => console.log(r));
      console.log('DONE');
    }, 1500);
  }, 300);
}, 100);
