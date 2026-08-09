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
  { id: 'vid1', name: 'video1.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 },
  { id: 'vid2', name: 'video2.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 8 },
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

function scrubTo(seconds) {
  const timeline = document.querySelector('#timeline-tracks');
  const x = seconds * 40;
  const rect = { left: 0, top: 0, width: 2000, height: 100, bottom: 100, right: 2000 };
  timeline.getBoundingClientRect = () => rect;
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: 10, bubbles: true }));
}

function importFile(name) {
  const input = document.querySelector('#media-input');
  input.files = [{ name }];
  input.dispatchEvent(new window.Event('change'));
}

function importOnLayer(layerIndex) {
  const select = document.querySelector('#import-layer');
  select.value = String(layerIndex);
  select.dispatchEvent(new window.Event('change'));
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

function clipTrackIndex(clipElement) {
  const tracks = [...visualTracks()];
  const domIndex = tracks.indexOf(clipElement.closest('.track.visual-track'));
  return domIndex === -1 ? -1 : tracks.length - 1 - domIndex;
}

function openMenu() {
  const previewWindow = document.querySelector('.preview-window');
  previewWindow.dispatchEvent(new window.MouseEvent('contextmenu', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
}

function clickMenu(id) {
  document.querySelector('#' + id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

setTimeout(() => {
  try {
    importFile('video1.mp4');
    setTimeout(() => {
      importOnLayer(1);
      importFile('video2.mp4');
      setTimeout(() => {
        const c2 = findVideoClip('video2.mp4');
        if (!c2) throw new Error('video2 hittades inte.');
        dragClipToStart(c2.clip, 0);
        scrubTo(0.5);
        setTimeout(() => {
          const menu = document.querySelector('#layer-context-menu');

          openMenu();
          if (menu.hidden) throw new Error('Context-menyn öppnades inte i previewn.');
          const title = document.querySelector('#layer-context-title').textContent;
          console.log('Open menu (top clip at playhead):', title);
          if (!title.includes('video2.mp4')) throw new Error('Menyn ska peka på det översta klippet vid playhead.');

          const forwardBtn = document.querySelector('#layer-forward');
          const backwardBtn = document.querySelector('#layer-backward');
          console.log('  forward disabled:', forwardBtn.disabled, '(expect true)');
          console.log('  backward disabled:', backwardBtn.disabled, '(expect false)');
          if (!forwardBtn.disabled) throw new Error('Framåt ska vara inaktiverat för översta klippet.');
          if (backwardBtn.disabled) throw new Error('Bakåt ska vara aktivt för översta klippet.');

          clickMenu('layer-backward');
          setTimeout(() => {
            const b1 = findVideoClip('video1.mp4');
            const b2 = findVideoClip('video2.mp4');
            if (!b1 || !b2) throw new Error('Klipp hittades inte efter bakåt.');
            const t1 = clipTrackIndex(b1.clip);
            const t2 = clipTrackIndex(b2.clip);
            console.log('After "Bakåt i lager": video1 track', t1, ' video2 track', t2);
            if (t1 !== 1 || t2 !== 0) throw new Error('Bakåt i lager flyttade inte video2 nedåt (video1 ska vara överst).');
            if (!menu.hidden) throw new Error('Menyn stängdes inte efter klick.');

            const topPreview = document.querySelector('#preview');
            const layerMedia = [...document.querySelectorAll('.layer-media')];
            const bottomId = layerMedia.find((el) => el.dataset.clipId && el.dataset.clipId !== topPreview.dataset.clipId)?.dataset.clipId;
            console.log('  top preview clipId:', topPreview.dataset.clipId, ' bottom layer clipId:', bottomId);
            if (!bottomId) throw new Error('Hittade inte det understa klippets media-element.');
            document.elementFromPoint = () => document.querySelector(`.layer-media[data-clip-id="${bottomId}"]`);

            openMenu();
            if (menu.hidden) throw new Error('Menyn öppnades inte mot understa klippet.');
            const title2 = document.querySelector('#layer-context-title').textContent;
            console.log('Open menu (bottom clip):', title2);
            console.log('  forward disabled:', forwardBtn.disabled, '(expect false)');
            console.log('  backward disabled:', backwardBtn.disabled, '(expect true)');
            if (forwardBtn.disabled) throw new Error('Framåt ska vara aktivt för understa klippet.');
            if (!backwardBtn.disabled) throw new Error('Bakåt ska vara inaktiverat för understa klippet.');

            clickMenu('layer-forward');
            setTimeout(() => {
              const f1 = findVideoClip('video1.mp4');
              const f2 = findVideoClip('video2.mp4');
              if (!f1 || !f2) throw new Error('Klipp hittades inte efter framåt.');
              const tf1 = clipTrackIndex(f1.clip);
              const tf2 = clipTrackIndex(f2.clip);
              console.log('After "Framåt i lager": video1 track', tf1, ' video2 track', tf2);
              if (tf1 !== 0 || tf2 !== 1) throw new Error('Framåt i lager flyttade inte video2 uppåt igen.');
              if (!menu.hidden) throw new Error('Menyn stängdes inte efter klick.');
              console.log('DONE');
              process.exit(0);
            }, 150);
          }, 150);
        }, 150);
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
