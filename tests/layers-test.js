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

// Polyfills
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
const layerEyeButtons = () => [...document.querySelectorAll('.layer-eye')];
const visibleLayerMedia = () => [...document.querySelectorAll('.layer-media')].filter((el) => !el.hidden);

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

setTimeout(() => {
  try {
    // 1. Import first video on Auto -> single V1 track.
    importFile('video1.mp4');
    setTimeout(() => {
      console.log('After first import:');
      console.log('  visual tracks:', visualTracks().length, '(expect 1)');
      if (visualTracks().length !== 1) throw new Error('Första importen skapade inte en enda visuell spår.');

      // 2. Import second video directly on layer 2 (track index 1).
      importOnLayer(1);
      importFile('video2.mp4');
      setTimeout(() => {
        const tracks = visualTracks();
        const layerOptions = [...document.querySelector('#import-layer').options].map((o) => o.value);
        console.log('After second import on layer 2:');
        console.log('  visual tracks:', tracks.length, '(expect 2)');
        console.log('  import-layer options:', layerOptions.join(','), '(expect auto,0,1,2)');
        if (tracks.length !== 2) throw new Error('Import på specifikt lager skapade inte ett andra visuellt spår.');
        if (!layerOptions.includes('2')) throw new Error('Lager-väljaren uppdaterades inte med nytt lager.');
        const c1 = findVideoClip('video1.mp4');
        const c2 = findVideoClip('video2.mp4');
        if (!c1 || !c2) throw new Error('Klipp hittades inte.');
        console.log('  clips on a second track:', c1.track !== c2.track, '(expect true)');
        if (c1.track === c2.track) throw new Error('Det importerade klippet hamnade inte på ett eget lager.');

        // 3. Drag second clip to start 0 so it overlaps video1.
        dragClipToStart(c2.clip, 0);
        scrubTo(0.5);
        setTimeout(() => {
          const preview = document.querySelector('#preview');
          const allLayerElements = [...document.querySelectorAll('.layer-media')];
          const mediaLayers = visibleLayerMedia();
          console.log('Overlap compositing at t=0.5:');
          console.log('  #preview hidden:', preview.hidden, '(expect false – top layer video)');
          console.log('  all .layer-media count:', allLayerElements.length, '/ visible:', mediaLayers.length);
          allLayerElements.forEach((m) => {
            console.log('    layer hidden=', m.hidden, 'z=', m.style.zIndex, 'id=', m.dataset.mediaId);
          });
          if (preview.hidden) throw new Error('Topplagret visas inte i förhandsvisningen.');
          if (mediaLayers.length < 1) throw new Error('Underliggande lager visas inte i förhandsvisningen.');
          const bottomZ = mediaLayers[0].style.zIndex;
          const topZ = preview.style.zIndex;
          console.log('  z-index bottom / top:', bottomZ, '/', topZ, '(expect 0 / 10)');
          if (bottomZ !== '0' || topZ !== '10') throw new Error('Lagerordningen i förhandsvisningen är fel.');

          // 4. Hide layer 1 (V1) via the eye toggle -> underlying layer disappears.
          const eye = layerEyeButtons()[0];
          if (!eye) throw new Error('Öga-knapp saknas på lager 1.');
          eye.dispatchEvent(new window.Event('click'));
          setTimeout(() => {
            const previewAfter = document.querySelector('#preview');
            const mediaLayersAfter = visibleLayerMedia();
            console.log('After hiding layer 1:');
            console.log('  #preview hidden:', previewAfter.hidden, '(expect false – layer 2 still shown)');
            console.log('  visible .layer-media count:', mediaLayersAfter.length, '(expect 0 – layer 1 hidden)');
            if (mediaLayersAfter.length !== 0) throw new Error('Dolt lager visas fortfarande i förhandsvisningen.');
            if (eye.classList.contains('active')) throw new Error('Öga-knappen visar inte att lagret är dolt.');
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
