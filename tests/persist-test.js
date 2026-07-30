const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = '/mnt/games/home-relocated/Downloads/videditor';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const PERSIST_KEY = 'videoeditor:editor';

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  installDomStubs(window);
  window.crypto = window.crypto || {};
  if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.CSS = window.CSS || {}; window.CSS.escape = (s) => s;
  window.alert = (m) => { throw new Error('ALERT: ' + m); };
  if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
    configurable: true, get() { return this._files || null; }, set(v) { this._files = v; }
  });
  const mediaSeq = [{ id: 'vid1', name: 'video1.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 }];
  let mi = 0;
  const makeResponse = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
  window.fetch = async (url, opts) => {
    if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
    if (url === '/api/media' && opts && opts.method === 'POST') return makeResponse(mediaSeq[mi++] || mediaSeq[0]);
    if (url.includes('/extract-audio')) return makeResponse({ id: 'aud1', name: 'extracted.m4a', kind: 'audio', hasAudio: true, duration: 10, storedName: 'x.m4a' });
    return makeResponse({});
  };
  return window;
}

function runApp(window) {
  try { window.eval(timelineModelJs); window.eval(appJs); }
  catch (e) { console.log('SCRIPT ERROR:', e.message); process.exit(1); }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  // --- Session 1: upload a video, let it persist ---
  const w1 = makeDom();
  runApp(w1);
  await wait(150);
  const videoInput = w1.document.querySelector('#media-input');
  videoInput.files = [{ name: 'video1.mp4' }];
  videoInput.dispatchEvent(new w1.Event('change'));
  await wait(500); // allow async autoSplit + 250ms persist timer
  const saved = w1.localStorage.getItem(PERSIST_KEY);
  const parsed = saved ? JSON.parse(saved) : null;
  const clips1 = parsed ? parsed.clips.length : 0;
  console.log('Session 1 saved clips:', clips1, saved ? '(key present)' : '(NO KEY)');

  // --- Session 2: fresh dom, inject saved snapshot, expect restore ---
  const w2 = makeDom();
  if (saved) w2.localStorage.setItem(PERSIST_KEY, saved);
  runApp(w2);
  await wait(200);
  const restoredVideoClips = w2.document.querySelectorAll('.clip.video').length;
  const restoredAudioClips = w2.document.querySelectorAll('.clip.audio').length;
  const restoredTotal = restoredVideoClips + restoredAudioClips;
  console.log('Session 2 restored video clips:', restoredVideoClips, 'audio clips:', restoredAudioClips, 'total:', restoredTotal, '(expect total', clips1, ')');
  console.log('Session 2 audio clips (autoSplit):', restoredAudioClips);

  const ok = saved && clips1 >= 1 && restoredTotal === clips1;
  console.log(ok ? 'PERSIST OK' : 'PERSIST FAIL');
  process.exit(ok ? 0 : 1);
})();
