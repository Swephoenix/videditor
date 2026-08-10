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

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    await wait(30);
    const input = document.querySelector('#media-input');
    input.files = [{ name: 'tal.mp4' }];
    input.dispatchEvent(new window.Event('change'));
    await wait(80);

    const audioClip = document.querySelector('.clip.audio');
    audioClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
    document.querySelector('#transcribe').click();
    await wait(50);
    document.querySelector('#start-transcribe').click();
    await wait(150);

    if (document.querySelectorAll('.clip.transcription').length !== 0) {
      throw new Error('Transkriptionssegment renderas fortfarande på tidslinjen.');
    }

    // 1. Markera källjudet och redigera i den samlade högerpanelen.
    audioClip.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 20, clientY: 20 }));
    const panel = document.querySelector('#transcription-tools');
    const textarea = document.querySelector('#transcription-editor-all');
    if (panel.hidden || !textarea.value.includes('Hej världen igen')) {
      throw new Error('Den samlade transkriptionspanelen öppnades inte för källjudet.');
    }
    textarea.value = textarea.value.replace('Hej världen igen', 'Hej nya världen med fler ord');
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.querySelector('#save-all-transcription').click();
    await wait(50);
    if (!textarea.value.includes('Hej nya världen med fler ord')) throw new Error('Paneltexten uppdaterades inte efter spara.');

    // 2. Sök efter nytt ord ska fungera (index uppdaterad).
    const search = document.querySelector('#transcript-search-input');
    search.value = 'nya';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    const results = [...document.querySelectorAll('.transcript-search-result')];
    console.log('Sökträffar på "nya":', results.length, '(expect 1)');
    if (results.length !== 1) throw new Error(`Sökning efter nytt ord gav ${results.length} träffar.`);

    // 3. Overlay-texten ska använda nya ord (ordtidskoder genererade).
    const wordsInput = document.querySelector('#transcript-words');
    wordsInput.value = '20';
    wordsInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const burnToggle = document.querySelector('#burn-transcription');
    burnToggle.checked = true;
    burnToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    const timeline = document.querySelector('#timeline-tracks');
    timeline.getBoundingClientRect = () => ({ left: 0, top: 0, width: 4000, height: 100, bottom: 100, right: 4000 });
    timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: 1.5 * 40, clientY: 10, bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 1.5 * 40, clientY: 10, bubbles: true }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 1.5 * 40, clientY: 10, bubbles: true }));
    const overlay = document.querySelector('#transcript-overlay');
    console.log('Overlay-text:', overlay.textContent.trim(), '(innehåller "nya")');
    if (!overlay.textContent.includes('nya')) throw new Error('Overlayn använder inte de redigerade orden.');

    // 4. Oförändrad spara ska vara ofarlig.
    document.querySelector('#save-all-transcription').click();
    if (!document.querySelector('#transcription-copy-status').textContent.includes('Inga ändringar')) {
      throw new Error('Oförändrad spara rapporterades inte korrekt.');
    }

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
})();
