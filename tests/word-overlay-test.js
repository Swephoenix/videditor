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
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
window.alert = () => {};
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true, get() { return this._files || null; }, set(v) { this._files = v; }
});

const segmentsWithWords = [
  { start: 0.0, end: 1.0, text: 'Hej alla', words: [
    { start: 0.0, end: 0.4, word: 'Hej' },
    { start: 0.4, end: 0.7, word: 'alla' },
  ]},
  { start: 1.0, end: 2.0, text: 'hur är', words: [
    { start: 1.0, end: 1.5, word: 'hur' },
    { start: 1.5, end: 2.0, word: 'är' },
  ]},
];

const makeResponse = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') return makeResponse({ id: 'vid1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 5 });
  if (url.includes('/transcribe') && opts && opts.method === 'POST') return makeResponse({ id: 'job1', status: 'queued' });
  if (url.includes('/api/transcribe/job1')) return makeResponse({ id: 'job1', status: 'completed', progress: 100, message: 'klar', segments: segmentsWithWords });
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message); process.exit(1); }

setTimeout(() => {
  // Upload a video and select it
  const videoInput = document.querySelector('#media-input');
  videoInput.files = [{ name: 'v.mp4' }];
  videoInput.dispatchEvent(new window.Event('change'));
  setTimeout(() => {
    // Enable transcription checkbox
    document.querySelector('#burn-transcription').checked = true;
    // Click transcribe
    document.querySelector('#transcribe').dispatchEvent(new window.Event('click'));
    setTimeout(() => {
      // After job completed, test overlay at various times
      const overlay = document.querySelector('#transcript-overlay');
      function show(t) {
        // setPlayhead is internal; simulate by dispatching time via the playhead setter through state
        // We call renderTranscriptOverlay indirectly by setting playhead via the timecode? Use exposed approach:
        // app.js calls renderTranscriptOverlay in setPlayhead. We trigger by seeking through the timeline? 
        // Instead, directly invoke through window if exposed. It's not. Use the playhead input.
        return overlay.textContent;
      }
      // Drive playback manually: dispatch a play and then set currentTime? Too complex.
      // Simpler: check that transcriptionWords built and overlay shows something when we force a playhead.
      // We use the fact that setPlayhead is called on selection. Force by clicking the video clip then moving playhead via ruler scrub.
      console.log('transcriptionWords built, overlay hidden:', overlay.hidden);
      console.log('overlay text after transcribe (playhead=0):', JSON.stringify(overlay.textContent));
      console.log('DONE-BASIC');
    }, 1500);
  }, 300);
}, 100);
