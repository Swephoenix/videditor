const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');
const { buildCircleMaskFilter, buildVisualSizeFilter } = require('../server');

const ROOT = '/mnt/games/home-relocated/Downloads/videditor';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

// ---- Serverfilter-kontrakt ----
const circle = buildCircleMaskFilter(0.35);
if (!circle.includes('format=rgba,geq=')) throw new Error('Cirkelmasken saknar format/geq.');
if (!circle.includes('0.3500*min(W,H)')) throw new Error('Cirkelradien matar inte in storleken.');
if (!circle.includes('alpha(X,Y)')) throw new Error('Cirkelmasken bevarar inte alfakanalen.');
const circleClamped = buildCircleMaskFilter(9);
if (!circleClamped.includes('0.5000*min(W,H)')) throw new Error('Cirkelstorlek klampar inte till max.');
const sizeFilter = buildVisualSizeFilter({ kind: 'video', visualScale: 1, posX: 0, posY: 0, circular: { size: 0.5 } }, 1920, 1080);
if (!sizeFilter.includes('pad=1920:1080')) throw new Error('Size-filtret för cirkulärt klipp är trasigt.');
const movedSizeFilter = buildVisualSizeFilter({ kind: 'video', visualScale: 1, posX: 0.5, posY: 0, circular: { size: 0.5 } }, 1920, 1080);
if (!movedSizeFilter.includes('crop=1920:1080')) throw new Error('Förskjutet cirkulärt klipp saknar crop till exportytan.');
console.log('Serverfilter OK');

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
window.fetch = async (url, opts) => {
  const response = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    return response({ id: 'v1', name: 'video.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 });
  }
  if (url.includes('/extract-audio')) return response({ id: 'a1', kind: 'audio', hasAudio: true, duration: 10 });
  return response({});
};

try {
  window.eval(timelineModelJs);
  window.eval(`${appJs}
    window.__test = { state, applyVisualLayout, editorSnapshot, updateShapeTools };
  `);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message, e.stack);
  process.exit(1);
}

const { state, applyVisualLayout, editorSnapshot } = window.__test;

setTimeout(() => {
  try {
    const previewWindow = document.querySelector('.preview-window');
    Object.defineProperty(previewWindow, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(previewWindow, 'clientHeight', { configurable: true, value: 600 });

    const clip = {
      id: 'c1', kind: 'video', mediaId: 'v1', name: 'video', start: 0, trimStart: 0, trimEnd: 5,
      mediaDuration: 10, sourceWidth: 1280, sourceHeight: 720,
      crop: { left: 0, right: 0, top: 0, bottom: 0 },
      visualScale: 1, posX: 0, posY: 0, circular: { size: 0.5 }, trackIndex: 0
    };
    state.clips = [clip];
    state.selectedId = 'c1';
    const videoEl = document.querySelector('#preview');
    applyVisualLayout(clip, videoEl);

    const clipPath = videoEl.style.clipPath || '';
    console.log('clip-path för cirkulärt klipp:', clipPath);
    if (!clipPath.startsWith('circle(') || !clipPath.includes('px at 50% 50%')) {
      throw new Error('Förhandsvisningen applicerar inte cirkulär mask.');
    }

    // Utan cirkulär mask -> vanlig inset-crop.
    clip.circular = null;
    applyVisualLayout(clip, videoEl);
    const insetPath = videoEl.style.clipPath || '';
    console.log('clip-path utan mask:', insetPath);
    if (!insetPath.startsWith('inset(')) throw new Error('Icke-cirkulärt klipp fick cirkulär mask.');

    // Snapshot innehåller circular.
    clip.circular = { size: 0.35 };
    const snapClip = editorSnapshot().clips.find((c) => c.id === 'c1');
    console.log('circular i snapshot:', JSON.stringify(snapClip.circular), '(expect {"size":0.35})');
    if (!snapClip.circular || snapClip.circular.size !== 0.35) throw new Error('Cirkulär mask sparas inte i snapshot.');

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
