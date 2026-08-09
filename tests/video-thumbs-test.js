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

const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
const thumbRequests = [];
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    return makeResponse({ id: 'v1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 });
  }
  if (typeof url === 'string' && url.includes('/thumbs?')) thumbRequests.push(url);
  return makeResponse({});
};
window.Image = class {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(value) {
    this._src = value;
    if (typeof value === 'string' && value.includes('/thumbs?')) thumbRequests.push(value);
    this.complete = true;
    this.naturalWidth = 320;
    this.naturalHeight = 90;
    if (this.onload) setTimeout(() => this.onload(), 0);
  }
  get src() { return this._src; }
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

setTimeout(() => {
  (async () => {
    try {
      const input = document.querySelector('#media-input');
      input.files = [{ name: 'v.mp4' }];
      input.dispatchEvent(new window.Event('change'));
      await wait(150);

      const videoClips = document.querySelectorAll('.clip.video');
      console.log('Videoklipp:', videoClips.length, '(expect 1)');
      if (videoClips.length !== 1) throw new Error('Videoklipp saknas.');

      const thumbs = videoClips[0].querySelector('.clip-thumbs');
      console.log('Thumbnail-canvas finns:', !!thumbs, '(expect true)');
      if (!thumbs) throw new Error('Thumbnail-canvas skapades inte.');

      const audioClips = document.querySelectorAll('.clip.audio');
      const waveform = audioClips[0]?.querySelector('.clip-waveform');
      console.log('Ljudvågform finns kvar:', !!waveform, '(expect true)');
      if (!waveform) throw new Error('Ljudvågformen försvann.');

      console.log('Canvas-storlek:', thumbs.width, 'x', thumbs.height, '(förväntas >= 8 bredd, 60 höjd)');
      if (thumbs.width < 8 || thumbs.height !== 60) throw new Error('Canvas-storleken är felaktig.');

      // Thumbnail-förfrågan ska innehålla klippets trim-intervall.
      console.log('Thumb-requests:', thumbRequests.length, '(expect >= 1)');
      if (thumbRequests.length < 1) throw new Error('Ingen thumbnail-förfrågan gjordes.');
      const req = thumbRequests[0];
      console.log('Förfrågan:', req.replace('/api/media/v1/thumbs?', ''));
      if (!req.includes('start=') || !req.includes('end=')) {
        throw new Error('Thumbnail-förfrågan saknar trim-intervall (start/end).');
      }

      console.log('DONE');
      process.exit(0);
    } catch (e) {
      console.log('TEST ERROR:', e.message, e.stack);
      process.exit(1);
    }
  })();
}, 100);
