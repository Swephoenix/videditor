const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
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
  { id: 'img1', name: 'bild.png', kind: 'image', hasVideo: true, width: 800, height: 600, duration: 0 },
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
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

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

function cssRuleZ(selector) {
  const match = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*([0-9]+)'));
  return match ? Number(match[1]) : null;
}

setTimeout(() => {
  try {
    const scaleZ = cssRuleZ('.visual-scale-overlay');
    const cropZ = cssRuleZ('.crop-overlay');
    const handleZ = cssRuleZ('.crop-handle');
    const panZ = cssRuleZ('.crop-pan');
    console.log('CSS z-index: scale-overlay', scaleZ, ' crop-overlay', cropZ, ' crop-handle', handleZ, ' crop-pan', panZ);
    if (scaleZ === null || scaleZ < 1000) throw new Error('visual-scale-overlay måste ligga ovanför alla media-lager.');
    if (cropZ === null || cropZ < 1000) throw new Error('crop-overlay måste ligga ovanför alla media-lager.');
    if (handleZ === null || handleZ <= cropZ) throw new Error('crop-handles måste ligga ovanför crop-overlayn.');
    if (panZ === null || panZ <= cropZ) throw new Error('crop-pan måste ligga ovanför crop-overlayn.');

    importFile('video1.mp4');
    setTimeout(() => {
      importOnLayer(1);
      importFile('bild.png');
      setTimeout(() => {
        const imageClips = document.querySelectorAll('.clip.image');
        if (imageClips.length !== 1) throw new Error('Bilden importerades inte på eget lager.');

        const imageClip = imageClips[0];
        imageClip.dispatchEvent(new window.Event('click', { bubbles: true }));
        setTimeout(() => {
          const imageMedia = [...document.querySelectorAll('#image-preview, .layer-media')].find((el) => !el.hidden);
          const mediaZ = imageMedia ? Number(imageMedia.style.zIndex || 0) : 0;
          console.log('Bildens z-index i preview:', mediaZ, '(track ovanpå video -> 10+)');
          if (mediaZ < 10) throw new Error('Bilden borde ligga på lager 2 (z-index 10).');

          const scaleOverlay = document.querySelector('#visual-scale-overlay');
          console.log('visual-scale-overlay synlig för vald bild:', !scaleOverlay.hidden);
          if (scaleOverlay.hidden) throw new Error('Scale-overlayn visas inte för vald bild ovanpå video.');

          document.querySelector('#qt-crop').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
          setTimeout(() => {
            const cropOverlay = document.querySelector('#crop-overlay');
            console.log('crop-overlay synlig:', !cropOverlay.hidden);
            console.log('crop-handles:', document.querySelectorAll('.crop-handle').length, '(expect 8)');
            if (cropOverlay.hidden) throw new Error('Crop-overlayn visas inte för bild ovanpå video.');
            if (document.querySelectorAll('.crop-handle').length !== 8) throw new Error('Crop-handles saknas.');
            console.log('DONE');
            process.exit(0);
          }, 100);
        }, 100);
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
