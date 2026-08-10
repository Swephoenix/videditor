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

const visualTracks = () => document.querySelectorAll('.track.visual-track');

function findVideoClip(name) {
  for (const track of visualTracks()) {
    for (const clip of track.querySelectorAll('.clip.video')) {
      if (clip.title.includes(name)) return { clip, track };
    }
  }
  return null;
}

function clipStartSeconds(clipElement) {
  return (parseFloat(clipElement.style.left) || 0) / 40;
}

function dragByPixels(clipElement, deltaPx) {
  const timeline = document.querySelector('#timeline-tracks');
  timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 4000, height: 300, bottom: 300, right: 4000 });
  clipElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 90, bottom: 90, right: 400 });
  clipElement.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 0, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: deltaPx, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: deltaPx, clientY: 10, bubbles: true }));
}

function dragVideo2To(targetStartSeconds) {
  const clipElement = findVideoClip('video2.mp4').clip;
  const timeline = document.querySelector('#timeline-tracks');
  timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 4000, height: 300, bottom: 300, right: 4000 });
  clipElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 90, bottom: 90, right: 400 });
  const currentStart = clipStartSeconds(clipElement);
  const deltaPx = (targetStartSeconds - currentStart) * 40;
  clipElement.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 0, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: deltaPx, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: deltaPx, clientY: 10, bubbles: true }));
}

setTimeout(() => {
  try {
    importFile('video1.mp4');
    setTimeout(() => {
      importFile('video2.mp4');
      setTimeout(() => {
        const c1 = findVideoClip('video1.mp4');
        const c2 = findVideoClip('video2.mp4');
        if (!c1 || !c2) throw new Error('Klipp hittades inte.');
        const start2 = clipStartSeconds(c2.clip);
        console.log('Initial layout: video1 start', clipStartSeconds(c1.clip), ' video2 start', start2, '(expect 0 / 10)');
        if (Math.abs(start2 - 10) > 0.05) throw new Error('video2 ska börja vid 10 s efter video1 (0–10 s).');

        const snapGuide = document.querySelector('#snap-guide');

        // 1. Drag video2 from 10s to 15s -> 0.15s before video1's end (0s edge at 10s).
        // Proposed new start = 15s; left edge 15s vs candidate 10s = 5s away (no snap).
        // Then a second drag towards 10.1s should snap to exactly 10s.
        dragVideo2To(10.15);
        const afterA = clipStartSeconds(findVideoClip('video2.mp4').clip);
        console.log('Drag toward video1 end (target 10.15s):', afterA.toFixed(2), '(expect 10.00 – snapped)');
        if (Math.abs(afterA - 10) > 0.01) throw new Error('Klippet snappade inte till kanten 10 s.');

        // 2. Right edge snap: video2 spans 10..18 after snap; drag its left edge back
        // near video1's start (0) via the right edge? Simpler: drag video2 far away first.
        dragVideo2To(30);
        const afterB = clipStartSeconds(findVideoClip('video2.mp4').clip);
        console.log('Drag far away (target 30s):', afterB.toFixed(2), '(expect 30 – no snap)');
        if (Math.abs(afterB - 30) > 0.1) throw new Error('Klippet ska inte snappa när det dras långt bort.');

        // 3. Snap guide visible during a snap drag, hidden after.
        dragVideo2To(10.2);
        const afterC = clipStartSeconds(findVideoClip('video2.mp4').clip);
        console.log('Drag to 10.2s (within threshold):', afterC.toFixed(2), '(expect 10 – snapped)');
        if (Math.abs(afterC - 10) > 0.01) throw new Error('Klippet snappade inte vid andra försöket.');
        if (!snapGuide.hidden) throw new Error('Snap-guide ska vara dold efter avslutat drag.');

        // 4. Snap to playhead: move playhead to 25s, drag video2 near it.
        const timeline = document.querySelector('#timeline-tracks');
        timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 4000, height: 100, bottom: 100, right: 4000 });
        timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 25 * 40, clientY: 10, bubbles: true }));
        document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 25 * 40, clientY: 10, bubbles: true }));
        document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 25 * 40, clientY: 10, bubbles: true }));
        dragVideo2To(24.85);
        const afterD = clipStartSeconds(findVideoClip('video2.mp4').clip);
        console.log('Snap to playhead (25s):', afterD.toFixed(2), '(expect 25)');
        if (Math.abs(afterD - 25) > 0.01) throw new Error('Klippet snappade inte till playhead 25 s.');
        if (!snapGuide.hidden) throw new Error('Snap-guide ska vara dold efter playhead-snap.');

        console.log('DONE');
        process.exit(0);
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
