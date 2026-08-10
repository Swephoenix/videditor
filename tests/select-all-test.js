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

const mediaSeq = [
  { id: 'v1', name: 'video1.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 },
  { id: 'v2', name: 'video2.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 8 },
];
let mediaIdx = 0;
const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    const m = mediaSeq[mediaIdx++] || mediaSeq[0];
    return makeResponse(m);
  }
  if (url.includes('/extract-audio')) {
    const id = url.split('/').pop();
    return makeResponse({ id: 'aud-' + id, name: 'extracted.m4a', kind: 'audio', hasAudio: true, duration: 10, storedName: 'x.m4a' });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

function importFile(name) {
  const input = document.querySelector('#media-input');
  input.files = [{ name }];
  input.dispatchEvent(new window.Event('change'));
}

function ctrlA() {
  const event = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

function clickTimeline() {
  const timeline = document.querySelector('#timeline-tracks');
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 10, clientY: 10, bubbles: true }));
}

setTimeout(() => {
  try {
    importFile('video1.mp4');
    setTimeout(() => {
      importFile('video2.mp4');
      setTimeout(() => {
        const totalClips = document.querySelectorAll('.clip').length;
        console.log('Totalt antal klipp:', totalClips, '(expect 4: 2 video + 2 ljud)');
        if (totalClips !== 4) throw new Error('Förväntade 4 klipp efter två importer.');

        // 1. Ctrl+A utan att ha klickat i tidslinjen -> inget händer (endast det automatiskt valda kvar).
        const before = ctrlA();
        const selectedBefore = document.querySelectorAll('.clip.selected').length;
        console.log('Ctrl+A utan tidslinjeklick: preventDefault=', before.defaultPrevented, 'markerade=', selectedBefore, '(expect false / <4)');
        if (before.defaultPrevented || selectedBefore >= totalClips) throw new Error('Ctrl+A markerade trots att tidslinjen inte klickats på.');

        // 2. Klicka i tidslinjen, sedan Ctrl+A -> alla klipp markerade.
        clickTimeline();
        const after = ctrlA();
        const selectedAfter = document.querySelectorAll('.clip.selected').length;
        console.log('Ctrl+A efter tidslinjeklick: preventDefault=', after.defaultPrevented, 'markerade=', selectedAfter, '(expect true / 4)');
        if (!after.defaultPrevented || selectedAfter !== totalClips) throw new Error('Ctrl+A markerade inte alla klipp efter tidslinjeklick.');
        console.log('DONE');
        process.exit(0);
      }, 250);
    }, 250);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
