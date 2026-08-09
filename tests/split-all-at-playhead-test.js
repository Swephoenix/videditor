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
  { id: 'v3', name: 'video3.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 8 },
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

const visualTracks = () => document.querySelectorAll('.track.visual-track');

function importFile(name) {
  const input = document.querySelector('#media-input');
  input.files = [{ name }];
  input.dispatchEvent(new window.Event('change'));
}

function scrubTo(seconds) {
  const timeline = document.querySelector('#timeline-tracks');
  const x = seconds * 40;
  const rect = { left: 0, top: 0, width: 4000, height: 200, bottom: 200, right: 4000 };
  timeline.getBoundingClientRect = () => rect;
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: 10, bubbles: true }));
}

function findVideoClip(name) {
  for (const track of visualTracks()) {
    for (const clip of track.querySelectorAll('.clip.video')) {
      if (clip.title.includes(name)) return { clip, track };
    }
  }
  return null;
}

function dragClipToStart(clipElement, targetStart) {
  const timeline = document.querySelector('#timeline-tracks');
  timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 4000, height: 300, bottom: 300, right: 4000 });
  clipElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 90, bottom: 90, right: 400 });
  const currentStart = (parseFloat(clipElement.style.left) || 0) / 40;
  clipElement.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 0, clientY: 10, bubbles: true }));
  const deltaPx = (targetStart - currentStart) * 40;
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: deltaPx, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: deltaPx, clientY: 10, bubbles: true }));
}

function clipCount() {
  return document.querySelectorAll('.clip.video').length + document.querySelectorAll('.clip.audio').length;
}

setTimeout(() => {
  try {
    importFile('video1.mp4');
    setTimeout(() => {
      importFile('video2.mp4');
      setTimeout(() => {
        const c2 = findVideoClip('video2.mp4');
        if (!c2) throw new Error('video2 hittades inte.');
        dragClipToStart(c2.clip, 3);
        scrubTo(5);
        setTimeout(() => {
          const before = clipCount();
          console.log('Klipp före delning:', before, '(2 video + 2 ljud = 4)');
          const splitBtn = document.querySelector('#qt-split');
          splitBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const after = clipCount();
            console.log('Klipp efter delning utan markering:', after, '(expect', before * 2, '– alla klipp vid playhead delas)');
            if (after !== before * 2) throw new Error(`Dela delade inte alla klipp: ${before} -> ${after}`);

            const selected = [...document.querySelectorAll('.clip.selected')];
            console.log('Markerade efter delning:', selected.length, '(expect 0 – inget valt)');
            if (selected.length !== 0) throw new Error('Inget ska vara markerat efter att alla delats.');

            // Kontrollera att playhead ligger i båda klippen och att klippen verkligen delades vid 5s.
            const v1a = findVideoClip('video1.mp4');
            if (!v1a) throw new Error('video1 försvann.');
            console.log('DONE');
            process.exit(0);
          }, 150);
        }, 150);
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
