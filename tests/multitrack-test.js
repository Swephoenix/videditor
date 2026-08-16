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

// Allow setting input.files
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(v) { this._files = v; }
});

// Stub api() network calls
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

// Run app.js in window context
try {
  // app.js uses 'use strict' and top-level const; run via indirect eval in window scope
  window.eval(timelineModelJs);
  window.eval(appJs);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message);
  process.exit(1);
}

setTimeout(() => {
  try {
    // Simulate uploading two videos
    const videoInput = document.querySelector('#media-input');
    // trigger uploadFile via change
    // app.js reads input.files[0]; stub a file
    videoInput.files = [{ name: 'video1.mp4' }];
    videoInput.dispatchEvent(new window.Event('change'));
    setTimeout(() => {
      videoInput.files = [{ name: 'video2.mp4' }];
      videoInput.dispatchEvent(new window.Event('change'));
      setTimeout(() => {
        // Låt den automatiska ljudsepareringen bli klar innan idempotensen provas.
        setTimeout(() => {
        const visualTracks = document.querySelectorAll('.track.visual-track');
        const audioTracks = document.querySelectorAll('.track.audio-track');
        console.log('After 2 video uploads:');
        console.log('  visual-track elements:', visualTracks.length, '(expect 1: sequential clips reuse layer 1)');
        console.log('  audio-track elements:', audioTracks.length, '(expect 1 base)');
        const clips = document.querySelectorAll('.clip.video');
        console.log('  video clips:', clips.length, '(expect 2)');
        if (visualTracks.length !== 1 || clips.length !== 2) throw new Error('Sekventiella videor återanvände inte V1.');

        // Separera igen får inte skapa en dubblerad ljudkopia ovanpå det länkade ljudet.
        const vidClips = [...document.querySelectorAll('.clip.video')];
        vidClips[1].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
        document.querySelector('#separate-audio').dispatchEvent(new window.Event('click'));
        setTimeout(() => {
          const audioClips = document.querySelectorAll('.clip.audio');
          const audioTracks2 = document.querySelectorAll('.track.audio-track');
          const mutedVideos = document.querySelectorAll('.clip.video.muted');
          console.log('After separate audio:');
          console.log('  audio clips:', audioClips.length, '(expect 2: en länkad kopia per video)');
          console.log('  audio-track elements:', audioTracks2.length, '(expect 1: inga dubblerade ljud)');
          console.log('  muted video clips:', mutedVideos.length, '(expect 2)');
          if (audioClips.length !== 2 || audioTracks2.length !== 1 || mutedVideos.length !== 2) throw new Error('Ljudet dubblerades eller placerades fel.');

          // Test undo (Ctrl+Z) ska behålla den stabila spårmodellen.
          document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
          setTimeout(() => {
            const audioClipsUndo = document.querySelectorAll('.clip.audio');
            const visualTracksUndo = document.querySelectorAll('.track.visual-track');
            const mutedUndo = document.querySelectorAll('.clip.video.muted');
            console.log('After undo:');
            console.log('  audio clips:', audioClipsUndo.length, '(expect 2)');
            console.log('  visual-track elements:', visualTracksUndo.length, '(expect 1)');
            console.log('  muted video clips:', mutedUndo.length, '(expect 2)');
            if (audioClipsUndo.length !== 2 || visualTracksUndo.length !== 1 || mutedUndo.length !== 2) throw new Error('Undo återställde inte den kompakterade spårmodellen.');
             console.log('DONE');
             process.exit(0);
          }, 200);
         }, 200);
        }, 200);
      }, 200);
   }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
  }
}, 100);
