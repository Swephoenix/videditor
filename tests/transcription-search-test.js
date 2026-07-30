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
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.alert = (message) => { throw new Error(`Oväntad alert: ${message}`); };
if (!window.structuredClone) window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(value) { this._files = value; }
});

const segments = [
  {
    start: 0,
    end: 2,
    text: 'Hej världen igen',
    words: [
      { start: 0.2, end: 0.6, word: 'Hej' },
      { start: 0.8, end: 1.3, word: 'världen' },
      { start: 1.5, end: 1.9, word: 'igen' }
    ]
  },
  {
    start: 3,
    end: 4,
    text: 'Världen väntar',
    words: [
      { start: 3.1, end: 3.5, word: 'Världen' },
      { start: 3.6, end: 4, word: 'väntar' }
    ]
  }
];

const response = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, options) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media' && options?.method === 'POST') {
    return response({ id: 'video-1', name: 'tal.mp4', kind: 'video', hasAudio: true, width: 1280, height: 720, duration: 5 });
  }
  if (url.includes('/extract-audio')) {
    return response({ id: 'audio-1', name: 'tal.m4a', kind: 'audio', hasAudio: true, duration: 5 });
  }
  if (url === '/api/media/audio-1/transcribe' && options?.method === 'POST') return response({ id: 'job-1' });
  if (url === '/api/transcribe/job-1') {
    return response({ id: 'job-1', mediaId: 'audio-1', status: 'completed', progress: 100, segments });
  }
  return response({});
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  window.eval(timelineModelJs);
  window.eval(appJs);
  await wait(30);
  const input = document.querySelector('#media-input');
  input.files = [{ name: 'tal.mp4' }];
  input.dispatchEvent(new window.Event('change'));
  await wait(80);

  const videoClip = document.querySelector('.clip.video');
  videoClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
  if (!document.querySelector('#clip-context-menu').hidden) throw new Error('Videoklippet fick en transkriberingsmeny.');
  const audioClip = document.querySelector('.clip.audio');
  audioClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
  if (document.querySelector('#clip-context-menu').hidden) throw new Error('Högerklicksmenyn öppnades inte.');
  document.querySelector('#transcribe').click();
  await wait(100);

  const search = document.querySelector('#transcript-search-input');
  search.value = 'VÄRLDEN igen';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const results = [...document.querySelectorAll('.transcript-search-result')];
  if (results.length !== 1) throw new Error(`Förväntade en flerordsträff, fick ${results.length}.`);
  results[0].click();
  if (document.querySelector('#timecode').textContent !== '00:00.800') {
    throw new Error(`Spelhuvudet hoppade inte till ordtiden: ${document.querySelector('#timecode').textContent}`);
  }
  if (!results[0].textContent.includes('Hej världen igen')) throw new Error('Träffen saknar textutdrag.');

  const timelineScroll = document.querySelector('#timeline-scroll');
  timelineScroll.getBoundingClientRect = () => ({ left: 130, width: 900, right: 1030, top: 0, bottom: 260, height: 260 });
  const widthBeforeZoom = Number.parseFloat(document.querySelector('#timeline-tracks').style.width);
  const zoomEvent = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: 500 });
  timelineScroll.dispatchEvent(zoomEvent);
  const widthAfterZoom = Number.parseFloat(document.querySelector('#timeline-tracks').style.width);
  if (!(widthAfterZoom > widthBeforeZoom)) throw new Error('Ctrl+mushjul zoomade inte in tidslinjen.');
  if (!zoomEvent.defaultPrevented) throw new Error('Webbläsarens standardzoom stoppades inte över tidslinjen.');
  console.log('TRANSCRIPTION SEARCH OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
