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
window.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: true })
});

try {
  window.eval(timelineModelJs);
  window.eval(`${appJs}
    window.__test = { state, rebuildTranscriptionIndex, setPlayhead };
  `);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message, e.stack);
  process.exit(1);
}

const { state, rebuildTranscriptionIndex, setPlayhead } = window.__test;
const overlay = () => document.querySelector('#transcript-overlay');

function scrubTo(seconds) {
  setPlayhead(seconds);
}

const check = (label, expected) => {
  const actual = overlay().textContent;
  const ok = actual === expected;
  console.log(`${ok ? 'OK' : 'FEL'}  ${label}: "${actual}" (förväntat "${expected}")`);
  if (!ok) throw new Error(`${label}: "${actual}" != "${expected}"`);
};

setTimeout(() => {
  try {
    // Transkriberat klipp: mediaId vid1, 0-10s. Ord i 0-2s.
    state.clips = [{ id: 'c1', kind: 'video', mediaId: 'vid1', start: 0, trimStart: 0, trimEnd: 10, trackIndex: 1 }];
    state.transcriptionMediaId = 'vid1';
    state.transcriptionSegments = [
      { start: 0.0, end: 1.0, text: 'Hej alla', words: [
        { start: 0.0, end: 0.4, word: 'Hej' },
        { start: 0.4, end: 0.7, word: 'alla' }
      ]},
      { start: 1.0, end: 2.0, text: 'hur ar', words: [
        { start: 1.0, end: 1.5, word: 'hur' },
        { start: 1.5, end: 2.0, word: 'är' }
      ]}
    ];
    rebuildTranscriptionIndex();
    document.querySelector('#burn-transcription').checked = true;

    scrubTo(0.5);
    check('t=0.5 (mitt i tal)', 'Hej alla');
    const videoZ = Number(document.querySelector('#preview').style.zIndex || 0);
    const transcriptZ = Number(overlay().style.zIndex || 0);
    if (transcriptZ <= videoZ) {
      throw new Error(`Transkriptionen ligger bakom V2-videon: transcript=${transcriptZ}, video=${videoZ}`);
    }

    scrubTo(1.2);
    check('t=1.2 (mitt i tal)', 'Hej alla hur');

    scrubTo(2.5);
    check('t=2.5 (inom grace 1,5 s efter sista ordet)', 'alla hur är');

    scrubTo(5);
    check('t=5 (efter grace -> dold)', '');

    scrubTo(12);
    check('t=12 (utanför klippet -> dold)', '');

    scrubTo(0.1);
    check('t=0.1 igen (visas igen)', 'Hej');

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message);
    process.exit(1);
  }
}, 100);
